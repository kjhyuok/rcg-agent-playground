"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricsBar } from "@/components/metrics-bar";
import { AgentSidebar } from "@/components/agent-sidebar";
import { ChatPanel } from "@/components/chat-panel";
import { ExecutionFlow } from "@/components/execution-flow";
import { SettingsModal } from "@/components/settings-modal";
import type {
  Agent,
  ChatMessage,
  AgentSettings,
  MockResponse,
} from "@/lib/types";
import {
  generateMockExecutionFlow,
  type ExecutionStep,
} from "@/lib/agentcore-services";
import { invokeAgent, checkHealth } from "@/lib/api";

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
  0: "🛒 추천 Agent 준비 완료! 고객 ID와 함께 상품 추천을 요청하세요.\n\n예시: \"고객 C001에게 적합한 상품 3개 추천해주세요\"",
  1: "📞 CS Agent 준비 완료! 주문번호와 함께 문의하세요.\n\n예시: \"주문 ORD-2024-789 환불해주세요\"",
  2: "📊 수요예측 Agent 준비 완료! 매장 재고 분석을 요청하세요.\n\n예시: \"현재 재고 분석하고 긴급 발주 진행해\"",
  3: "⚙️ 커스텀 Agent — Settings에서 ARN을 설정하세요.",
};

function getAgentsForPhase(phase: number): Agent[] {
  const defaultLatencies = [128, 95, 180, 0];
  return AGENT_DEFINITIONS.map((def, idx) => ({
    id: idx,
    name: def.name,
    icon: def.icon,
    status: def.phase <= phase ? "ACTIVE" as const : "LOCKED" as const,
    latency: def.phase <= phase ? defaultLatencies[idx] : null,
    invocations: 0,
    phase: def.phase,
    description: def.description,
  }));
}

export default function Home() {
  const [currentPhase, setCurrentPhase] = useState(1);
  const [agents, setAgents] = useState<Agent[]>(getAgentsForPhase(1));
  const [selectedAgent, setSelectedAgent] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AgentSettings>({
    region: "us-east-1",
    recommendArn: "",
    csArn: "",
    demandArn: "",
    customArn: "",
  });

  // Metrics state (start at 0, accumulate on invoke)
  const [latency, setLatency] = useState(0);
  const [tokens, setTokens] = useState(0);
  const [cost, setCost] = useState(0);
  const [requests, setRequests] = useState(0);
  const [successRate, setSuccessRate] = useState(100);

  // Execution Flow state
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  // API connection state
  const [apiConnected, setApiConnected] = useState(false);
  const [apiAccount, setApiAccount] = useState("");

  // API health check on mount
  useEffect(() => {
    checkHealth().then((h) => {
      setApiConnected(h.status === "connected");
      if (h.account) setApiAccount(h.account);
    });
  }, []);

  // 초기 환영 메시지 (클라이언트에서만)
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        type: "agent",
        content: WELCOME_MESSAGES[0],
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Settings 변경 시 → ARN 유무로 Agent 활성화 + Phase 자동 계산
  useEffect(() => {
    const arnKeys = ["recommendArn", "csArn", "demandArn", "customArn"];
    const hasArn = arnKeys.map((k) => settings[k]?.trim() !== "");

    // Phase 자동 계산: 어떤 ARN까지 입력됐는지
    let detectedPhase = 1;
    if (hasArn[1] || hasArn[2]) detectedPhase = 2;
    if (hasArn[3]) detectedPhase = 3;
    setCurrentPhase(detectedPhase);

    // Agent 상태 업데이트 (ARN 있으면 ACTIVE)
    setAgents(
      AGENT_DEFINITIONS.map((def, idx) => ({
        id: idx,
        name: def.name,
        icon: def.icon,
        status: hasArn[idx] ? "ACTIVE" as const : "LOCKED" as const,
        latency: hasArn[idx] ? [128, 95, 180, 0][idx] : null,
        invocations: 0,
        phase: def.phase,
        description: def.description,
        services: def.services,
      }))
    );
  }, [settings]);

  // Agent 전환 시 환영 메시지 변경
  const handleSelectAgent = useCallback((idx: number) => {
    const arnKeys = ["recommendArn", "csArn", "demandArn", "customArn"];
    if (!settings[arnKeys[idx]]?.trim()) return; // ARN 없으면 선택 불가
    setSelectedAgent(idx);
    setMessages([
      {
        id: `welcome-${idx}-${Date.now()}`,
        type: "agent",
        content: WELCOME_MESSAGES[idx],
        timestamp: new Date(),
      },
    ]);
    setExecutionSteps([]);
  }, [settings]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isExecuting) return;
    setInputValue("");

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      type: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const agentTypes: Array<"recommend" | "cs" | "demand" | "custom"> = [
      "recommend", "cs", "demand", "custom",
    ];
    const agentType = agentTypes[selectedAgent];

    // 실제 ARN이 있는지 확인
    const arnKeys = ["recommendArn", "csArn", "demandArn", "customArn"];
    const currentArn = settings[arnKeys[selectedAgent]] || "";
    const useRealApi = apiConnected && currentArn.trim() !== "";

    // Mock 응답 (API 없을 때 fallback)
    const resp = MOCK_RESPONSES[selectedAgent];

    // Generate execution flow animation
    const flow = generateMockExecutionFlow(agentType, currentPhase);
    setIsExecuting(true);
    setExecutionSteps([]);

    // Animate Execution Flow steps
    flow.forEach((step, i) => {
      setTimeout(() => {
        setExecutionSteps((prev) => [...prev, { ...step, status: "active" }]);
      }, 300 + i * 500);
      setTimeout(() => {
        setExecutionSteps((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: "done" } : s))
        );
      }, 300 + i * 500 + 400);
    });

    if (useRealApi) {
      // ===== 실제 API 호출 =====
      const streamMsgId = `agent-${Date.now()}`;

      // "Thinking..." 표시
      setMessages((prev) => [
        ...prev,
        { id: streamMsgId, type: "agent", content: "", timestamp: new Date(), isStreaming: true },
      ]);

      try {
        const result = await invokeAgent(currentArn, text);

        if (result.success && result.response) {
          // 스트리밍 효과로 응답 표시
          const chars = result.response.split("");
          const charsPerTick = 3;
          let charIndex = 0;

          const streamInterval = setInterval(() => {
            charIndex += charsPerTick;
            if (charIndex >= chars.length) {
              charIndex = chars.length;
              clearInterval(streamInterval);
              setMessages((prev) =>
                prev.map((m) => m.id === streamMsgId ? { ...m, content: result.response!, isStreaming: false } : m)
              );
              setIsExecuting(false);
            } else {
              setMessages((prev) =>
                prev.map((m) => m.id === streamMsgId ? { ...m, content: chars.slice(0, charIndex).join("") } : m)
              );
            }
          }, 25);

          // Update metrics (실제 데이터)
          setLatency(result.latencyMs);
          setRequests((prev) => prev + 1);
        } else {
          // 에러 응답
          setMessages((prev) =>
            prev.map((m) => m.id === streamMsgId
              ? { ...m, content: `❌ Error: ${result.error || "Unknown error"}`, isStreaming: false }
              : m)
          );
          setIsExecuting(false);
        }
      } catch (e) {
        setMessages((prev) =>
          prev.map((m) => m.id === streamMsgId
            ? { ...m, content: `❌ API 연결 실패: ${e}`, isStreaming: false }
            : m)
        );
        setIsExecuting(false);
      }
    } else {
      // ===== Mock 모드 =====
      // Tool calls in chat
      const gatewayStepIndices = flow
        .map((s, i) => (s.serviceId === "gateway" ? i : -1))
        .filter((i) => i >= 0);

      resp.tools.forEach((tool, i) => {
        const stepIdx = gatewayStepIndices[i] ?? i;
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            { id: `tool-${Date.now()}-${i}`, type: "tool", content: tool, timestamp: new Date() },
          ]);
        }, 300 + stepIdx * 500);
      });

      // Streaming response
      const streamStartTime = 300 + flow.length * 500 + 200;
      const streamMsgId = `agent-${Date.now()}`;

      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { id: streamMsgId, type: "agent", content: "", timestamp: new Date(), isStreaming: true },
        ]);

        const chars = resp.reply.split("");
        const charsPerTick = 3;
        let charIndex = 0;

        const streamInterval = setInterval(() => {
          charIndex += charsPerTick;
          if (charIndex >= chars.length) {
            charIndex = chars.length;
            clearInterval(streamInterval);
            setMessages((prev) =>
              prev.map((m) => m.id === streamMsgId ? { ...m, content: resp.reply, isStreaming: false } : m)
            );
            setIsExecuting(false);

            const newLatency = flow.reduce((sum, s) => sum + (s.latencyMs || 0), 0);
            setLatency(Math.round(newLatency / 1000 * 10) / 10 * 1000 || 128);
            setTokens((prev) => prev + 4000 + Math.floor(Math.random() * 2000));
            setCost((prev) => prev + 0.003 + Math.random() * 0.002);
            setRequests((prev) => prev + 1);
            setAgents((prev) =>
              prev.map((a, i) =>
                i === selectedAgent ? { ...a, invocations: a.invocations + 1, latency: Math.round(newLatency / 1000) } : a
              )
            );
            return;
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamMsgId
                ? { ...m, content: chars.slice(0, charIndex).join("") }
                : m
            )
          );
        }, 25);
      }, streamStartTime);
    }
  }, [inputValue, selectedAgent, currentPhase, isExecuting, requests, settings, apiConnected]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0A0A0A]">
      {/* Header */}
      <motion.header
        className="flex items-center justify-between px-6 py-2.5 border-b border-white/10 bg-gradient-to-r from-[#4f19c7]/20 via-[#2d1b8a]/10 to-[#0d8a3e]/10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3">
          <img src="/agentcore-icon.png" alt="AgentCore" className="h-9 w-9 rounded-lg" />
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
        />
        <div className="glass rounded-xl p-4 overflow-hidden flex flex-col">
          <ExecutionFlow
            steps={executionSteps}
            currentPhase={currentPhase}
            isExecuting={isExecuting}
          />
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
