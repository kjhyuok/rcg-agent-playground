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


def detect_execution_steps(content: str) -> list:
    """응답 본문 키워드로 감지된 실행 단계를 순서대로 구성한다.
    Runtime API가 중간 이벤트를 제공하지 않아 완전한 실시간 트레이스는 불가능 —
    최종 응답을 근거로 재구성한 것임을 프론트에 명시해야 함."""
    steps = []
    detected_tools = [name for name, kws in TOOL_KEYWORDS.items() if any(kw in content for kw in kws)]

    for tool in detected_tools[:3]:
        steps.append({"serviceId": "gateway", "detail": tool})

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
                                # 첫 청크가 도착한 순간 = LLM이 실제로 답을 만들기 시작한 시점.
                                # 이 시점을 기준으로 실행 단계 배지를 한 번만 보여준다.
                                for step in detect_execution_steps(text_piece):
                                    yield f"data: {json.dumps({'type': 'step', **step})}\n\n"
                                steps_sent = True
                            partial += text_piece
                            yield f"data: {json.dumps({'type': 'chunk', 'content': partial})}\n\n"
                        elif event.get("type") == "done":
                            partial = event.get("response", partial)
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
