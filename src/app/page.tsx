"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricsBar } from "@/components/metrics-bar";
import { AgentSidebar } from "@/components/agent-sidebar";
import { ChatPanel } from "@/components/chat-panel";
import { ExecutionFlow, type DetectedStep } from "@/components/execution-flow";
import { SettingsModal } from "@/components/settings-modal";
import type {
  Agent,
  ChatMessage,
  AgentSettings,
  MockResponse,
} from "@/lib/types";
import { generateMockExecutionFlow, thinkingLabelFor } from "@/lib/agentcore-services";
import { invokeAgentStream, checkHealth } from "@/lib/api";

const AGENT_DEFINITIONS: Array<{
  name: string;
  icon: string;
  phase: number;
  description: string;
  services: string;
}> = [
  {
    name: "상품 추천 Agent",
    icon: "🛒",
    phase: 1,
    description: "고객 맞춤 상품 추천 + 매출 시각화",
    services: "Gateway · Runtime · Observability · Code Interpreter",
  },
  {
    name: "CS 자동화 Agent",
    icon: "📞",
    phase: 2,
    description: "주문 문의 · 반품/환불 · 경쟁사 가격 비교",
    services: "+ Memory · Policy · Browser",
  },
  {
    name: "수요예측 Agent",
    icon: "📊",
    phase: 2,
    description: "재고 분석 · 트렌드 수집 · 자동 발주",
    services: "+ Memory · Policy · Browser",
  },
  {
    name: "커스텀 Agent",
    icon: "⚡",
    phase: 3,
    description: "Multi-Agent 연결 + 품질 점수 측정",
    services: "+ Multi-Agent (A2A) · Evaluations",
  },
];

const MOCK_RESPONSES: MockResponse[] = [
  {
    tools: ["customer_profile", "product_search"],
    reply: "고객 C001(김건강, VIP)님의 프로필을 확인했습니다. 건강식품 선호, 견과류 알러지를 고려하여 추천합니다.\n\n✅ 추천 상품:\n1. 즉석밥 오곡밥 3팩 — ₩4,200 · ⭐4.5\n2. 제로슈거 콜라 — ₩1,800 · ⭐4.2\n\n❌ 제외: 유기농 그래놀라 (견과류), 오트밀 프로틴바 (기구매)",
  },
  {
    tools: ["cs_lookup_order", "cs_return_policy", "cs_process_return"],
    reply: "주문 ORD-2024-789 확인했습니다.\n\n📦 상품: 보조배터리 (₩35,000)\n📋 상태: 배송 완료\n\n반품 가능합니다. 상품 불량 사유로 환불 처리하겠습니다.\n✅ 환불 ₩35,000 → 원결제수단 3~5영업일 내 환급",
  },
  {
    tools: ["inventory_status", "sales_trend", "external_factors"],
    reply: "📊 재고 분석 결과 (store-001)\n\n⚠️ 품절 위험:\n• 음료류: 재고 23박스 (안전재고 80)\n• 라면류: 재고 45박스 (안전재고 100)\n\n📈 트렌드: 음료 +35% (폭염 예보)\n\n🛒 발주 권고:\n• 음료류 200박스 (긴급)\n• 라면류 80박스 (일반)\n\n⚠️ 총 ₩1,600,000 — 승인 필요",
  },
  {
    tools: ["custom_tool"],
    reply: "커스텀 Agent가 준비되었습니다. Settings에서 Agent ARN을 설정하면 실제 Agent를 호출할 수 있습니다.",
  },
];

const WELCOME_MESSAGES: Record<number, string> = {
  0: "🛒 추천 Agent 준비 완료! 고객 ID와 함께 상품 추천을 요청하세요.",
  1: "📞 CS Agent 준비 완료! 주문번호와 함께 문의하세요.",
  2: "📊 수요예측 Agent 준비 완료! 매장 재고 분석을 요청하세요.",
  3: "⚙️ 커스텀 Agent — Settings에서 ARN을 설정하세요.",
};

// Agent별 예시 질문 — 입력창 위 preset 칩으로 노출
const PRESET_QUESTIONS: Record<number, string[]> = {
  0: [
    "고객 C001에게 적합한 상품 3개 추천해주세요",
    "C002 고객 구매 이력 기반으로 추천해줘",
    "재구매 유도 상품 알려줘",
  ],
  1: [
    "주문 ORD-2024-789 환불해주세요",
    "C001 고객 최근 주문 상태 알려줘",
    "배송 지연 문의 대응 방법 알려줘",
  ],
  2: [
    "현재 재고 분석하고 긴급 발주 진행해",
    "음료류 재고 트렌드 알려줘",
    "이번 주 발주 우선순위 정리해줘",
  ],
  3: [
    "Settings에서 ARN을 먼저 설정해주세요",
  ],
};

const SETTINGS_STORAGE_KEY = "rcg-playground-settings";
const ARN_KEYS = ["recommendArn", "csArn", "demandArn", "customArn"] as const;
const DEFAULT_SETTINGS: AgentSettings = {
  recommendArn: "",
  csArn: "",
  demandArn: "",
  customArn: "",
};

function loadSettings(): AgentSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Agent 정의 + ARN 연결 여부만으로 파생되는 상태 (통계는 별도 state로 관리)
function deriveAgents(
  settings: AgentSettings,
  stats: Array<{ invocations: number; latency: number | null }>
): Agent[] {
  const hasArn = ARN_KEYS.map((k) => settings[k]?.trim() !== "");
  return AGENT_DEFINITIONS.map((def, idx) => ({
    id: idx,
    name: def.name,
    icon: def.icon,
    status: hasArn[idx] ? ("ACTIVE" as const) : ("LOCKED" as const),
    latency: hasArn[idx] ? stats[idx].latency : null,
    invocations: stats[idx].invocations,
    phase: def.phase,
    description: def.description,
    services: def.services,
  }));
}

// Settings 변경 시 → ARN 유무로 Phase 자동 계산 (파생값, state로 관리하지 않음)
function derivePhase(settings: AgentSettings): number {
  const hasArn = ARN_KEYS.map((k) => settings[k]?.trim() !== "");
  if (hasArn[3]) return 3;
  if (hasArn[1] || hasArn[2]) return 2;
  return 1;
}

// Agent별 대화 내역을 독립적으로 보관 — Agent를 전환해도 이전 대화가 사라지지 않음
function initialMessagesByAgent(): ChatMessage[][] {
  return AGENT_DEFINITIONS.map((_, idx) => [
    {
      id: `welcome-${idx}`,
      type: "agent" as const,
      content: WELCOME_MESSAGES[idx],
      timestamp: new Date(),
    },
  ]);
}

export default function Home() {
  const [selectedAgent, setSelectedAgent] = useState(0);
  // Agent별 대화 내역 — messagesByAgent[selectedAgent]가 현재 화면에 보이는 대화
  const [messagesByAgent, setMessagesByAgent] = useState<ChatMessage[][]>(initialMessagesByAgent);
  const messages = messagesByAgent[selectedAgent];
  const [inputValue, setInputValue] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // localStorage 복원도 lazy initializer로 — mount 후 effect에서 setState하지 않음
  const [settings, setSettings] = useState<AgentSettings>(loadSettings);

  // Agent별 실측 통계 (settings 변경과 독립적으로 유지 — 리셋되지 않음)
  const [agentStats, setAgentStats] = useState(
    AGENT_DEFINITIONS.map(() => ({ invocations: 0, latency: null as number | null }))
  );

  // Metrics state (start at 0, accumulate on invoke)
  const [latency, setLatency] = useState(0);
  const [tokens, setTokens] = useState(0);
  const [cost, setCost] = useState(0);
  const [requests, setRequests] = useState(0);
  const [successCount, setSuccessCount] = useState(0);

  const [isExecuting, setIsExecuting] = useState(false);
  // Agent별 실행 로그 — Agent를 전환해도 이전 호출의 감지 결과가 유지됨
  const [logsByAgent, setLogsByAgent] = useState<DetectedStep[][]>(
    () => AGENT_DEFINITIONS.map(() => [])
  );
  // Agent별로 liveLog가 실제 응답 기반(true)인지, ARN 미설정 예시 시나리오(false)인지
  const [logIsLiveByAgent, setLogIsLiveByAgent] = useState<boolean[]>(
    () => AGENT_DEFINITIONS.map(() => false)
  );
  const liveLog = logsByAgent[selectedAgent];
  const logIsLive = logIsLiveByAgent[selectedAgent];

  // API connection state
  const [apiConnected, setApiConnected] = useState(false);
  const [apiAccount, setApiAccount] = useState("");

  const agents = deriveAgents(settings, agentStats);
  const successRate = requests > 0 ? Math.round((successCount / requests) * 100) : 100;
  const currentPhase = derivePhase(settings);

  // 설정 변경 시 localStorage에 저장
  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // API health check on mount
  useEffect(() => {
    checkHealth().then((h) => {
      setApiConnected(h.status === "connected");
      if (h.account) setApiAccount(h.account);
    });
  }, []);

  // Agent 전환 — 대화 내역은 messagesByAgent에 그대로 유지됨
  const handleSelectAgent = useCallback((idx: number) => {
    if (isExecuting) return; // 실행 중에는 전환 불가 (좀비 스트림 방지)
    if (!settings[ARN_KEYS[idx]]?.trim()) return; // ARN 없으면 선택 불가
    setSelectedAgent(idx);
  }, [settings, isExecuting]);

  // 현재 선택된 Agent의 대화 내역만 갱신하는 헬퍼
  const updateMessages = useCallback((agentIdx: number, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setMessagesByAgent((prev) =>
      prev.map((msgs, i) => (i === agentIdx ? updater(msgs) : msgs))
    );
  }, []);

  // 특정 Agent의 실행 로그만 갱신하는 헬퍼
  const updateLog = useCallback((agentIdx: number, updater: (prev: DetectedStep[]) => DetectedStep[]) => {
    setLogsByAgent((prev) =>
      prev.map((log, i) => (i === agentIdx ? updater(log) : log))
    );
  }, []);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isExecuting) return;
    setInputValue("");

    const invokedAgentIdx = selectedAgent;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      type: "user",
      content: text,
      timestamp: new Date(),
    };
    updateMessages(invokedAgentIdx, (prev) => [...prev, userMsg]);

    const agentTypes: Array<"recommend" | "cs" | "demand" | "custom"> = [
      "recommend", "cs", "demand", "custom",
    ];
    const agentType = agentTypes[selectedAgent];

    // 실제 ARN이 있는지 확인
    const currentArn = settings[ARN_KEYS[selectedAgent]] || "";
    const useRealApi = apiConnected && currentArn.trim() !== "";

    // Mock 응답 (API 없을 때 fallback)
    const resp = MOCK_RESPONSES[selectedAgent];

    // Mock 모드의 tool call / streaming 타이밍 계산용 (실제 API 사용 시에는 미사용)
    const flow = generateMockExecutionFlow(agentType, currentPhase);
    setIsExecuting(true);
    updateLog(invokedAgentIdx, () => []); // 새 호출 시작 시 이 Agent의 이전 실행 로그 초기화
    setLogIsLiveByAgent((prev) => prev.map((v, i) => (i === invokedAgentIdx ? useRealApi : v)));

    if (useRealApi) {
      // ===== 실제 API 호출 =====
      const streamMsgId = `agent-${Date.now()}`;

      // 스트리밍 메시지 표시
      updateMessages(invokedAgentIdx, (prev) => [
        ...prev,
        { id: streamMsgId, type: "agent", content: "", timestamp: new Date(), isStreaming: true, isLive: true, thinkingSteps: [] },
      ]);

      // SSE 스트리밍으로 실시간 수신
      await invokeAgentStream(
        currentArn,
        text,
        // onChunk — 데이터가 올 때마다 즉시 표시. 첫 청크 도착 = 실제 답변 시작이므로
        // 그 시점에 남아있는 thinkingSteps는 모두 done으로 마감해 체크리스트를 정리한다
        (content) => {
          updateMessages(invokedAgentIdx, (prev) =>
            prev.map((m) => m.id === streamMsgId
              ? { ...m, content, thinkingSteps: m.thinkingSteps?.map((s) => ({ ...s, status: "done" as const })) }
              : m)
          );
        },
        // onDone — 완료
        (latencyMs) => {
          updateMessages(invokedAgentIdx, (prev) =>
            prev.map((m) => m.id === streamMsgId ? { ...m, isStreaming: false } : m)
          );
          setIsExecuting(false);
          setLatency(latencyMs);
          setRequests((prev) => prev + 1);
          setSuccessCount((prev) => prev + 1);
          setAgentStats((prev) =>
            prev.map((s, i) =>
              i === invokedAgentIdx
                ? { invocations: s.invocations + 1, latency: latencyMs }
                : s
            )
          );
        },
        // onError
        (error) => {
          updateMessages(invokedAgentIdx, (prev) =>
            prev.map((m) => m.id === streamMsgId
              ? { ...m, content: `❌ Error: ${error}`, isStreaming: false }
              : m)
          );
          setIsExecuting(false);
          setRequests((prev) => prev + 1);
        },
        undefined,
        // onStep — 응답 기반으로 감지된 실행 단계를 실행 로그 + 말풍선 안 "생각 중" 체크리스트에 반영
        (step) => {
          const stepId = `step-${Date.now()}-${Math.random()}`;
          updateLog(invokedAgentIdx, (prev) => [
            ...prev,
            { id: stepId, serviceId: step.serviceId, detail: step.detail, timestamp: Date.now() },
          ]);
          updateMessages(invokedAgentIdx, (prev) =>
            prev.map((m) => m.id === streamMsgId
              ? {
                  ...m,
                  thinkingSteps: [
                    ...(m.thinkingSteps || []).map((s) => ({ ...s, status: "done" as const })),
                    { id: stepId, label: thinkingLabelFor(step.serviceId), status: "active" as const },
                  ],
                }
              : m)
          );
        },
      );
    } else {
      // ===== Mock 모드 =====
      // Tool calls in chat + 실행 로그 동시 표시
      const gatewayStepIndices = flow
        .map((s, i) => (s.serviceId === "gateway" ? i : -1))
        .filter((i) => i >= 0);

      resp.tools.forEach((tool, i) => {
        const stepIdx = gatewayStepIndices[i] ?? i;
        setTimeout(() => {
          updateMessages(invokedAgentIdx, (prev) => [
            ...prev,
            { id: `tool-${Date.now()}-${i}`, type: "tool", content: tool, timestamp: new Date() },
          ]);
        }, 300 + stepIdx * 500);
      });

      flow.forEach((step, i) => {
        setTimeout(() => {
          updateLog(invokedAgentIdx, (prev) => [
            ...prev,
            { id: `mock-step-${Date.now()}-${i}`, serviceId: step.serviceId, detail: step.detail, timestamp: Date.now() },
          ]);
        }, 300 + i * 500);
      });

      // Streaming response
      const streamStartTime = 300 + flow.length * 500 + 200;
      const streamMsgId = `agent-${Date.now()}`;

      setTimeout(() => {
        updateMessages(invokedAgentIdx, (prev) => [
          ...prev,
          { id: streamMsgId, type: "agent", content: "", timestamp: new Date(), isStreaming: true, isLive: false },
        ]);

        const chars = resp.reply.split("");
        const charsPerTick = 3;
        let charIndex = 0;

        const streamInterval = setInterval(() => {
          charIndex += charsPerTick;
          if (charIndex >= chars.length) {
            charIndex = chars.length;
            clearInterval(streamInterval);
            updateMessages(invokedAgentIdx, (prev) =>
              prev.map((m) => m.id === streamMsgId ? { ...m, content: resp.reply, isStreaming: false } : m)
            );
            setIsExecuting(false);

            const newLatency = flow.reduce((sum, s) => sum + (s.latencyMs || 0), 0);
            const roundedLatency = Math.round(newLatency / 1000 * 10) / 10 * 1000 || 128;
            setLatency(roundedLatency);
            setTokens((prev) => prev + 4000 + Math.floor(Math.random() * 2000));
            setCost((prev) => prev + 0.003 + Math.random() * 0.002);
            setRequests((prev) => prev + 1);
            setSuccessCount((prev) => prev + 1);
            setAgentStats((prev) =>
              prev.map((s, i) =>
                i === invokedAgentIdx
                  ? { invocations: s.invocations + 1, latency: Math.round(newLatency / 1000) }
                  : s
              )
            );
            return;
          }

          updateMessages(invokedAgentIdx, (prev) =>
            prev.map((m) =>
              m.id === streamMsgId
                ? { ...m, content: chars.slice(0, charIndex).join("") }
                : m
            )
          );
        }, 25);
      }, streamStartTime);
    }
  }, [inputValue, selectedAgent, currentPhase, isExecuting, settings, apiConnected, updateMessages, updateLog]);

  return (
    <div className="flex flex-col h-screen overflow-hidden app-shell-bg">
      {/* Header */}
      <motion.header
        className="flex items-center justify-between px-6 py-2.5 border-b border-white/10 bg-gradient-to-r from-[#4f19c7]/20 via-[#2d1b8a]/10 to-[#0d8a3e]/10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3">
          <Image src="/agentcore-icon.png" alt="AgentCore" width={36} height={36} className="h-9 w-9 rounded-lg" />
          <div>
            <h1 className="text-[14px] font-bold text-white leading-tight">
              Build! Deploy! Observe!
            </h1>
            <p className="text-[10px] text-zinc-400">리테일 Agent 실전 구축 · Amazon Bedrock AgentCore</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Phase Indicator */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-zinc-500">Phase</span>
            <span className="text-cyan-400 font-semibold">{currentPhase}</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">
              {agents.filter((a) => a.status === "ACTIVE").length} agents
            </span>
          </div>
          <Badge
            variant="outline"
            className={`text-[11px] gap-1.5 ${
              apiConnected
                ? "border-green-500/30 text-green-400 bg-green-500/10"
                : "border-yellow-500/30 text-yellow-400 bg-yellow-500/10"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${apiConnected ? "bg-green-400 animate-pulse-dot" : "bg-yellow-400"}`} />
            {apiConnected ? `Connected · ${apiAccount}` : "API Offline"}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="text-slate-400 hover:text-white text-[12px]"
          >
            ⚙️ Settings
          </Button>
        </div>
      </motion.header>

      {/* Phase Progress + Last Invoke */}
      <MetricsBar
        latency={latency}
        tokens={tokens}
        cost={cost}
        requests={requests}
        successRate={successRate}
        currentPhase={currentPhase}
        activeAgents={agents.filter((a) => a.status === "ACTIVE").length}
      />

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-[260px_1fr_300px] gap-3 p-3 overflow-hidden">
        <AgentSidebar
          agents={agents}
          selectedAgent={selectedAgent}
          onSelectAgent={handleSelectAgent}
        />
        <ChatPanel
          messages={messages}
          inputValue={inputValue}
          onInputChange={setInputValue}
          onSend={handleSend}
          agentName={agents[selectedAgent].name}
          disabled={isExecuting}
          presetQuestions={PRESET_QUESTIONS[selectedAgent] || []}
          onPresetSelect={(q) => {
            if (isExecuting) return;
            setInputValue(q);
          }}
        />
        <div className="glass rounded-xl p-4 overflow-hidden flex flex-col">
          <ExecutionFlow currentPhase={currentPhase} liveLog={liveLog} isExecuting={isExecuting} isLive={logIsLive} />
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSettingsChange={setSettings}
      />
    </div>
  );
}
