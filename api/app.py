"""
Agent Playground — Flask API Backend
AgentCore Runtime invoke + health check
"""
import os
import json
import time
import uuid
import boto3
from flask import Flask, request, jsonify, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

REGION = os.environ.get("AWS_REGION", "us-west-2")


def get_agentcore_client():
    return boto3.client("bedrock-agentcore", region_name=REGION)


# 응답 텍스트에서 감지 가능한 Gateway Tool 흔적 (실제 Runtime은 중간 이벤트를 제공하지 않으므로
# 최종 응답 본문의 키워드로 "이 호출에서 어떤 Tool이 쓰였을 가능성이 높은지" 역추정한다)
TOOL_KEYWORDS = {
    "customer_profile": ["프로필", "고객 정보", "VIP", "알러지"],
    "product_search": ["추천 상품", "상품 추천", "카테고리", "재고"],
    "purchase_history": ["구매 이력", "기구매", "구매한"],
    "cs_lookup_order": ["주문", "ORD-", "배송"],
    "cs_process_return": ["환불", "반품", "반환"],
    "inventory_status": ["재고 분석", "품절", "안전재고"],
    "sales_trend": ["트렌드", "판매 추이", "성장"],
}


def extract_delta_text(event: dict):
    """Strands/Bedrock 표준 스트리밍 이벤트({"event": {"contentBlockDelta": ...}})에서
    텍스트 조각을 추출한다. 이 포맷이 아니면 None을 반환한다.
    (Agent가 커스텀 {"type": "chunk", "response": ...} 대신 stream_async()의
    원시 이벤트를 그대로 yield하는 경우를 위한 하위 호환 경로.)"""
    inner = event.get("event")
    if not isinstance(inner, dict):
        return None
    delta = inner.get("contentBlockDelta", {}).get("delta", {})
    text = delta.get("text")
    return text if isinstance(text, str) else None


def detect_gateway_tools(content: str) -> list:
    """응답 본문 키워드로 이 호출에서 쓰였을 가능성이 높은 Gateway Tool을 역추정한다.
    Tool 이름은 대부분 답변 본문 뒤쪽 근거에서 드러나므로 누적된 전체 응답으로 판단한다."""
    detected = [name for name, kws in TOOL_KEYWORDS.items() if any(kw in content for kw in kws)]
    return [{"serviceId": "gateway", "detail": tool} for tool in detected[:3]]


# Phase 2 계열 Agent(CS/수요예측)는 매 요청마다 Memory를 조회·저장하므로,
# ARN이 이 계열이면 llm/observability처럼 memory 배지를 항상 켠다.
# (Runtime API가 Memory 호출 이벤트를 노출하지 않아 텍스트로는 감지 불가 → ARN으로 판단)
MEMORY_ARN_MARKERS = ("phase2", "phase3", "_cs", "cs_", "demand", "custom")


def uses_memory(agent_arn: str) -> bool:
    arn = (agent_arn or "").lower()
    return any(m in arn for m in MEMORY_ARN_MARKERS)


# Browser / Policy는 응답 텍스트 흔적으로 감지한다.
# Browser: 경쟁사 가격 비교 시에만 쓰이므로 관련 키워드가 응답에 드러난다.
# Policy: 실제 Cedar 엔진 호출은 아니지만, System Prompt의 에스컬레이션 규칙이
#         적용되면 응답에 "에스컬레이션/별도 승인" 표현이 나온다 → 정책 규칙 적용으로 표시.
BROWSER_KEYWORDS = ["경쟁사", "가격 비교", "타사", "최저가", "competitor"]
POLICY_KEYWORDS = ["에스컬레이션", "별도 승인", "상위 부서", "담당자 확인", "승인이 필요"]


def detect_context_services(content: str) -> list:
    """응답 텍스트로 Browser/Policy 사용 흔적을 역추정한다."""
    steps = []
    if any(kw in content for kw in BROWSER_KEYWORDS):
        steps.append({"serviceId": "browser", "detail": "경쟁사 가격 페이지 조회"})
    if any(kw in content for kw in POLICY_KEYWORDS):
        steps.append({"serviceId": "policy", "detail": "가드레일 규칙 체크 (에스컬레이션)"})
    return steps


def detect_execution_steps(content: str) -> list:
    """응답 본문 키워드로 감지된 실행 단계를 순서대로 구성한다 (non-stream 경로용).
    Runtime API가 중간 이벤트를 제공하지 않아 완전한 실시간 트레이스는 불가능 —
    최종 응답을 근거로 재구성한 것임을 프론트에 명시해야 함."""
    steps = list(detect_gateway_tools(content))
    steps.extend(detect_context_services(content))
    steps.append({"serviceId": "llm", "detail": f"응답 생성 (~{len(content)}자)"})
    steps.append({"serviceId": "observability", "detail": "Trace 기록"})
    return steps


@app.route("/api/health", methods=["GET"])
def health():
    """AWS 연결 상태 + 계정 확인"""
    try:
        sts = boto3.client("sts", region_name=REGION)
        identity = sts.get_caller_identity()
        return jsonify({
            "status": "connected",
            "account": identity["Account"],
            "region": REGION,
            "arn": identity["Arn"],
        })
    except Exception as e:
        return jsonify({"status": "disconnected", "error": str(e)}), 500


@app.route("/api/invoke-stream", methods=["POST"])
def invoke_agent_stream():
    """AgentCore Runtime Agent를 호출하고 SSE로 스트리밍합니다."""
    data = request.json
    agent_arn = data.get("agentArn", "")
    message = data.get("message", "")
    actor_id = data.get("actorId", "playground-user")

    if not agent_arn or not message:
        return jsonify({"error": "agentArn and message required"}), 400

    def generate():
        client = get_agentcore_client()
        session_id = f"playground-{uuid.uuid4().hex[:24]}"
        start_time = time.time()

        # 시작 이벤트
        yield f"data: {json.dumps({'type': 'start', 'sessionId': session_id})}\n\n"

        try:
            payload = json.dumps({
                "message": message,
                "prompt": message,
                "actor_id": actor_id,
                "session_id": session_id,
            }).encode()

            response = client.invoke_agent_runtime(
                agentRuntimeArn=agent_arn,
                runtimeSessionId=session_id,
                payload=payload,
            )

            # AgentCore Runtime 응답 본문은 boto3 StreamingBody.
            # Agent가 async generator(yield) entrypoint로 구현돼 있으면 토큰이
            # 생성되는 즉시 이 스트림에 도착한다 — 여기서는 .read()로 전체를
            # 모아 기다리지 않고, 도착하는 즉시 그대로 클라이언트로 릴레이한다
            # (가짜 타이핑 효과 없이 진짜 스트리밍).
            response_body = response.get("response")
            content_type = response.get("contentType", "")
            partial = ""
            steps_sent = False

            if response_body:
                if "text/event-stream" in content_type:
                    # Agent가 SSE(async generator)로 응답한 경우: 도착하는 즉시 릴레이
                    for raw_line in response_body.iter_lines():
                        if not raw_line:
                            continue
                        line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line
                        if not line.startswith("data:"):
                            continue
                        try:
                            event = json.loads(line[len("data:"):].strip())
                        except json.JSONDecodeError:
                            continue

                        delta_text = extract_delta_text(event)

                        if event.get("type") == "chunk" or delta_text is not None:
                            text_piece = event.get("response", "") if event.get("type") == "chunk" else delta_text
                            if not steps_sent:
                                # 첫 청크 도착 = 답 생성 시작. 진행감을 위해 항상 켜지는
                                # llm/observability 배지를 이 시점에 먼저 보여준다.
                                yield f"data: {json.dumps({'type': 'step', 'serviceId': 'llm', 'detail': '응답 생성 중'})}\n\n"
                                yield f"data: {json.dumps({'type': 'step', 'serviceId': 'observability', 'detail': 'Trace 기록'})}\n\n"
                                # Phase 2 계열은 매 요청 Memory를 조회/저장하므로 항상 표시
                                if uses_memory(agent_arn):
                                    yield f"data: {json.dumps({'type': 'step', 'serviceId': 'memory', 'detail': '고객 맥락 조회 & 대화 저장'})}\n\n"
                                steps_sent = True
                            partial += text_piece
                            yield f"data: {json.dumps({'type': 'chunk', 'content': partial})}\n\n"
                        elif event.get("type") == "done":
                            partial = event.get("response", partial)

                    # Gateway Tool 감지는 누적된 최종 응답(partial) 전체로 수행한다.
                    # 첫 청크만 보면 Tool 키워드(프로필/추천 상품/구매 이력 등)가 대부분
                    # 본문 뒤쪽에 있어 감지되지 않아, Gateway 카드가 비어 보였다.
                    for step in detect_gateway_tools(partial):
                        yield f"data: {json.dumps({'type': 'step', **step})}\n\n"
                    # Browser/Policy는 응답 텍스트 흔적으로 감지 (경쟁사 비교 / 에스컬레이션)
                    for step in detect_context_services(partial):
                        yield f"data: {json.dumps({'type': 'step', **step})}\n\n"
                else:
                    # 하위 호환: 스트리밍을 지원하지 않는(return dict) Agent
                    result_bytes = response_body.read()
                    raw = result_bytes.decode("utf-8").strip() if result_bytes else ""
                    content = raw
                    if raw.startswith("{"):
                        try:
                            parsed = json.loads(raw)
                            if "response" in parsed:
                                content = parsed["response"]
                        except Exception:
                            pass
                    for step in detect_execution_steps(content):
                        yield f"data: {json.dumps({'type': 'step', **step})}\n\n"
                        time.sleep(0.15)
                    partial = content
                    yield f"data: {json.dumps({'type': 'chunk', 'content': partial})}\n\n"

            elapsed_ms = int((time.time() - start_time) * 1000)
            yield f"data: {json.dumps({'type': 'done', 'latencyMs': elapsed_ms, 'sessionId': session_id})}\n\n"

        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            yield f"data: {json.dumps({'type': 'error', 'error': str(e), 'latencyMs': elapsed_ms})}\n\n"

    return Response(generate(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
    })


@app.route("/api/agents/validate", methods=["POST"])
def validate_agent():
    """Agent ARN이 유효한지 확인합니다."""
    data = request.json
    agent_arn = data.get("agentArn", "")

    if not agent_arn:
        return jsonify({"valid": False, "error": "ARN is empty"}), 400

    # ARN에서 runtime ID 추출
    try:
        parts = agent_arn.split("/")
        runtime_id = parts[-1] if parts else ""

        client = get_agentcore_client()
        response = client.get_agent_runtime(agentRuntimeId=runtime_id)

        status = response.get("status", "UNKNOWN")
        name = response.get("name", "")

        return jsonify({
            "valid": True,
            "name": name,
            "status": status,
            "runtimeId": runtime_id,
        })
    except Exception as e:
        return jsonify({
            "valid": False,
            "error": str(e),
        }), 400


if __name__ == "__main__":
    print("🚀 Agent Playground API")
    print(f"   Region: {REGION}")
    print(f"   URL: http://localhost:5050")
    print()
    app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)
