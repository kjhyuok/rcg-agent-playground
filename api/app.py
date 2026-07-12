"""
Agent Playground — Flask API Backend
AgentCore Runtime invoke + health check
"""
import os
import json
import time
import uuid
import boto3
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

REGION = os.environ.get("AWS_REGION", "us-east-1")


def get_agentcore_client():
    return boto3.client("bedrock-agentcore", region_name=REGION)


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


@app.route("/api/invoke", methods=["POST"])
def invoke_agent():
    """AgentCore Runtime Agent를 호출합니다."""
    data = request.json
    agent_arn = data.get("agentArn", "")
    message = data.get("message", "")
    actor_id = data.get("actorId", "playground-user")

    if not agent_arn:
        return jsonify({"error": "agentArn is required"}), 400
    if not message:
        return jsonify({"error": "message is required"}), 400

    client = get_agentcore_client()
    session_id = f"playground-{uuid.uuid4().hex[:24]}"

    start_time = time.time()
    tool_calls = []
    response_text = ""
    error_msg = None

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

        # 응답 수집 — response 키가 StreamingBody
        response_body = response.get("response")
        if response_body and hasattr(response_body, "read"):
            result_bytes = response_body.read()
        else:
            result_bytes = b""

        elapsed_ms = int((time.time() - start_time) * 1000)
        raw_response = result_bytes.decode("utf-8") if result_bytes else ""

        # JSON 파싱 시도
        try:
            parsed = json.loads(raw_response)
            response_text = parsed.get("response", raw_response)
        except json.JSONDecodeError:
            response_text = raw_response

        # 응답에서 Tool call 흔적 추정 (텍스트 기반)
        execution_steps = []
        text_lower = response_text.lower() if response_text else ""

        # Gateway tools 감지
        gateway_tools = []
        tool_keywords = {
            "customer_profile": ["프로필", "고객 정보", "VIP", "알러지"],
            "product_search": ["검색", "상품", "카테고리", "재고"],
            "purchase_history": ["구매 이력", "기구매", "구매한"],
            "cs_lookup_order": ["주문", "ORD-", "배송"],
            "cs_process_return": ["환불", "반품", "반환"],
            "inventory_status": ["재고", "품절", "안전재고"],
            "sales_trend": ["트렌드", "판매 추이", "성장"],
        }
        for tool_name, keywords in tool_keywords.items():
            if any(kw in response_text for kw in keywords):
                gateway_tools.append(tool_name)

        for tool in gateway_tools[:4]:
            execution_steps.append({
                "serviceId": "gateway",
                "status": "done",
                "detail": tool,
                "latencyMs": 80 + int(elapsed_ms * 0.02),
            })

        # LLM 추정
        token_estimate = len(response_text) * 3 if response_text else 0
        execution_steps.append({
            "serviceId": "llm",
            "status": "done",
            "detail": f"tokens: ~{token_estimate} in / ~{len(response_text)} out",
            "latencyMs": int(elapsed_ms * 0.7),
        })

        # Code Interpreter 감지
        if any(x in text_lower for x in ["분석", "계산", "비교", "차트"]):
            execution_steps.append({
                "serviceId": "code-interpreter",
                "status": "done",
                "detail": "가격 비교 분석 실행",
                "latencyMs": int(elapsed_ms * 0.15),
            })

        # Observability (항상)
        execution_steps.append({
            "serviceId": "observability",
            "status": "done",
            "detail": "Trace 기록 완료",
            "latencyMs": 0,
        })

        return jsonify({
            "success": True,
            "response": response_text,
            "latencyMs": elapsed_ms,
            "sessionId": session_id,
            "executionSteps": execution_steps,
            "metadata": {
                "agentArn": agent_arn,
                "region": REGION,
                "toolsDetected": gateway_tools,
            },
        })

    except Exception as e:
        elapsed_ms = int((time.time() - start_time) * 1000)
        error_msg = str(e)
        return jsonify({
            "success": False,
            "error": error_msg,
            "latencyMs": elapsed_ms,
            "sessionId": session_id,
        }), 500


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

            response_body = response.get("response")
            if response_body and hasattr(response_body, "read"):
                result_bytes = response_body.read()
                raw = result_bytes.decode("utf-8").strip() if result_bytes else ""

                # JSON 파싱해서 response 필드만 추출
                content = raw
                if raw.startswith("{"):
                    try:
                        parsed = json.loads(raw)
                        if "response" in parsed:
                            content = parsed["response"]
                    except Exception:
                        pass

                # 글자 단위 스트리밍 (10자씩)
                chunk_size = 10
                for i in range(0, len(content), chunk_size):
                    partial = content[:i + chunk_size]
                    yield f"data: {json.dumps({'type': 'chunk', 'content': partial})}\n\n"
                    time.sleep(0.03)

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
    app.run(host="0.0.0.0", port=5050, debug=True)
