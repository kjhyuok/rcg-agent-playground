"""
Agent Playground — Flask API Backend
AgentCore Runtime invoke + health check
"""
import os
import json
import time
import uuid
import boto3
from flask import Flask, request, jsonify, send_from_directory
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

        # 응답 수집 — EventStream의 다양한 형태 처리
        result_bytes = b""
        event_log = []

        body = response.get("body")
        if body:
            if hasattr(body, "read"):
                # StreamingBody
                result_bytes = body.read()
            elif hasattr(body, "__iter__"):
                # EventStream
                for event in body:
                    event_log.append(str(type(event)) + ": " + str(list(event.keys()) if isinstance(event, dict) else ""))
                    if isinstance(event, dict):
                        # 다양한 키 시도
                        if "chunk" in event:
                            chunk_data = event["chunk"]
                            if isinstance(chunk_data, dict) and "bytes" in chunk_data:
                                result_bytes += chunk_data["bytes"]
                            elif isinstance(chunk_data, bytes):
                                result_bytes += chunk_data
                        elif "bytes" in event:
                            result_bytes += event["bytes"]
                        elif "payload" in event:
                            payload_data = event["payload"]
                            if isinstance(payload_data, bytes):
                                result_bytes += payload_data
                            elif isinstance(payload_data, dict) and "bytes" in payload_data:
                                result_bytes += payload_data["bytes"]
            else:
                result_bytes = str(body).encode()

        elapsed_ms = int((time.time() - start_time) * 1000)
        raw_response = result_bytes.decode("utf-8") if result_bytes else ""

        # JSON 파싱 시도
        try:
            parsed = json.loads(raw_response)
            response_text = parsed.get("response", raw_response)
        except json.JSONDecodeError:
            response_text = raw_response

        # 디버그: 응답이 비면 event_log 포함
        if not response_text and event_log:
            response_text = f"[DEBUG] No content parsed. Events: {event_log[:5]}"

        return jsonify({
            "success": True,
            "response": response_text,
            "latencyMs": elapsed_ms,
            "sessionId": session_id,
            "metadata": {
                "agentArn": agent_arn,
                "region": REGION,
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
