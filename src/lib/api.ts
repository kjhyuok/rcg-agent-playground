// 같은 오리진의 상대경로로 호출한다. Flask는 EC2 로컬 5050에만 떠 있고,
// next.config.ts의 rewrites가 /api/* 를 로컬 Flask로 프록시한다.
// (CloudFront는 3000만 노출하므로 브라우저가 :5050에 직접 붙을 수 없음)
const API_BASE = "";

export interface HealthResponse {
  status: "connected" | "disconnected";
  account?: string;
  region?: string;
  error?: string;
}

export async function checkHealth(): Promise<HealthResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    return res.json();
  } catch {
    return { status: "disconnected", error: "API server unreachable" };
  }
}

export interface AgentStreamStep {
  serviceId: string;
  detail: string;
}

export async function invokeAgentStream(
  agentArn: string,
  message: string,
  onChunk: (content: string) => void,
  onDone: (latencyMs: number) => void,
  onError: (error: string) => void,
  actorId?: string,
  onStep?: (step: AgentStreamStep) => void,
): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/invoke-stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentArn, message, actorId: actorId || "playground-user" }),
    });

    if (!res.ok) {
      onError(`HTTP ${res.status}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError("No response body");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "chunk") {
              onChunk(event.content);
            } else if (event.type === "step") {
              onStep?.({ serviceId: event.serviceId, detail: event.detail });
            } else if (event.type === "done") {
              onDone(event.latencyMs);
            } else if (event.type === "error") {
              onError(event.error);
            }
          } catch {
            // skip invalid JSON
          }
        }
      }
    }
  } catch (e) {
    onError(String(e));
  }
}

export async function validateAgent(agentArn: string): Promise<{
  valid: boolean;
  name?: string;
  status?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/api/agents/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentArn }),
    });
    return res.json();
  } catch {
    return { valid: false, error: "API server unreachable" };
  }
}
