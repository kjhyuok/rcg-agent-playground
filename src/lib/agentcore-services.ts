export type ServiceStatus = "idle" | "active" | "done" | "error" | "skipped";

export interface AgentCoreService {
  id: string;
  name: string;
  icon: string;
  description: string;
  status: ServiceStatus;
  latencyMs?: number;
  detail?: string;
  phase: number; // 이 서비스가 활성화되는 최소 Phase
}

export const AGENTCORE_SERVICES: AgentCoreService[] = [
  {
    id: "gateway",
    name: "Gateway",
    icon: "",
    description: "MCP Tool 호출",
    status: "idle",
    phase: 1,
  },
  {
    id: "llm",
    name: "Bedrock LLM",
    icon: "",
    description: "Claude Sonnet 4.6 추론",
    status: "idle",
    phase: 1,
  },
  {
    id: "code-interpreter",
    name: "Code Interpreter",
    icon: "",
    description: "Python 코드 실행",
    status: "idle",
    phase: 1,
  },
  {
    id: "memory",
    name: "Memory",
    icon: "",
    description: "고객 맥락 조회/저장",
    status: "idle",
    phase: 2,
  },
  {
    id: "policy",
    name: "Policy",
    icon: "",
    description: "가드레일 체크",
    status: "idle",
    phase: 2,
  },
  {
    id: "browser",
    name: "Browser",
    icon: "",
    description: "웹 실시간 조회",
    status: "idle",
    phase: 2,
  },
  {
    id: "observability",
    name: "Observability",
    icon: "",
    description: "Trace 자동 기록",
    status: "idle",
    phase: 1,
  },
  {
    id: "multi-agent",
    name: "Multi-Agent",
    icon: "",
    description: "A2A 라우팅",
    status: "idle",
    phase: 3,
  },
  {
    id: "evaluations",
    name: "Evaluations",
    icon: "",
    description: "품질 점수 측정",
    status: "idle",
    phase: 3,
  },
];

export interface ExecutionStep {
  serviceId: string;
  status: ServiceStatus;
  detail: string;
  latencyMs?: number;
  timestamp: number;
}

// Phase별로 사용되는 서비스 매핑
export function getActiveServicesForPhase(phase: number): string[] {
  return AGENTCORE_SERVICES.filter((s) => s.phase <= phase).map((s) => s.id);
}

// Mock execution flow 생성 (Phase + Agent 타입에 따라)
export function generateMockExecutionFlow(
  agentType: "recommend" | "cs" | "demand" | "custom",
  phase: number
): ExecutionStep[] {
  const steps: ExecutionStep[] = [];
  let time = 0;

  // Phase 2+: Memory Retrieve
  if (phase >= 2 && (agentType === "cs" || agentType === "demand")) {
    steps.push({
      serviceId: "memory",
      status: "done",
      detail: "이전 맥락 조회 (3 records)",
      latencyMs: 85 + Math.floor(Math.random() * 40),
      timestamp: time,
    });
    time += 120;
  }

  // Gateway Tool calls
  const toolCalls =
    agentType === "recommend"
      ? ["customer_profile", "product_search"]
      : agentType === "cs"
      ? ["cs_lookup_order", "cs_return_policy"]
      : agentType === "demand"
      ? ["inventory_status", "sales_trend"]
      : ["custom_tool"];

  for (const tool of toolCalls) {
    const lat = 80 + Math.floor(Math.random() * 120);
    steps.push({
      serviceId: "gateway",
      status: "done",
      detail: tool,
      latencyMs: lat,
      timestamp: time,
    });
    time += lat + 50;
  }

  // LLM
  const llmLat = 3000 + Math.floor(Math.random() * 5000);
  steps.push({
    serviceId: "llm",
    status: "done",
    detail: `tokens: ${4000 + Math.floor(Math.random() * 3000)} in / ${500 + Math.floor(Math.random() * 400)} out`,
    latencyMs: llmLat,
    timestamp: time,
  });
  time += llmLat;

  // Code Interpreter (Phase 1 추천 only, 가끔)
  if (agentType === "recommend" && Math.random() > 0.5) {
    steps.push({
      serviceId: "code-interpreter",
      status: "done",
      detail: "가격 비교 분석 실행",
      latencyMs: 2000 + Math.floor(Math.random() * 3000),
      timestamp: time,
    });
    time += 3000;
  }

  // Phase 2+: Policy check
  if (phase >= 2 && agentType === "cs") {
    const amount = Math.floor(Math.random() * 100000);
    const escalate = amount > 50000;
    steps.push({
      serviceId: "policy",
      status: "done",
      detail: escalate
        ? `환불 ₩${amount.toLocaleString()} → ESCALATE`
        : `환불 ₩${amount.toLocaleString()} → ALLOW`,
      latencyMs: 12 + Math.floor(Math.random() * 20),
      timestamp: time,
    });
    time += 30;
  }

  // Phase 2+: Browser (CS에서 가끔)
  if (phase >= 2 && agentType === "cs" && Math.random() > 0.6) {
    steps.push({
      serviceId: "browser",
      status: "done",
      detail: "경쟁사 가격 조회 (mock-site)",
      latencyMs: 1500 + Math.floor(Math.random() * 2000),
      timestamp: time,
    });
    time += 2000;
  }

  // Phase 2+: Memory Store
  if (phase >= 2 && (agentType === "cs" || agentType === "demand")) {
    steps.push({
      serviceId: "memory",
      status: "done",
      detail: "대화 기록 저장",
      latencyMs: 40 + Math.floor(Math.random() * 30),
      timestamp: time,
    });
    time += 60;
  }

  // Observability (항상)
  steps.push({
    serviceId: "observability",
    status: "done",
    detail: "Trace 기록 완료",
    latencyMs: 0,
    timestamp: time,
  });

  // Phase 3: Multi-Agent
  if (phase >= 3) {
    steps.unshift({
      serviceId: "multi-agent",
      status: "done",
      detail: `→ ${agentType} Agent 라우팅`,
      latencyMs: 200 + Math.floor(Math.random() * 100),
      timestamp: 0,
    });
  }

  return steps;
}
