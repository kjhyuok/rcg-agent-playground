const API_BASE = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.hostname}:5050`
  : "http://localhost:5050";

export interface InvokeResponse {
  success: boolean;
  response?: string;
  error?: string;
  latencyMs: number;
  sessionId: string;
  executionSteps?: Array<{
    serviceId: string;
    status: string;
    detail: string;
    latencyMs?: number;
  }>;
  metadata?: {
    agentArn: string;
    region: string;
    toolsDetected?: string[];
  };
}

export interface HealthResponse {
  status: "connected" | "disconnected";
  account?: string;
  region?: string;
  error?: string;
}

export async function invokeAgent(
  agentArn: string,
  message: string,
  actorId?: string
): Promise<InvokeResponse> {
  const res = await fetch(`${API_BASE}/api/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentArn, message, actorId: actorId || "playground-user" }),
  });
  return res.json();
}

export async function checkHealth(): Promise<HealthResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    return res.json();
  } catch {
    return { status: "disconnected", error: "API server unreachable" };
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
