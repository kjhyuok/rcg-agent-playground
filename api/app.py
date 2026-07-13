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
                partial = ""
                for i in range(0, len(content), chunk_size):
                    partial += content[i:i + chunk_size]
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
    app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)
