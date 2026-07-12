"use client";

import { motion } from "framer-motion";
import { AGENTCORE_SERVICES } from "@/lib/agentcore-services";

interface ExecutionFlowProps {
  currentPhase: number;
}

const SERVICE_COLORS: Record<string, string> = {
  gateway: "bg-emerald-500",
  llm: "bg-violet-500",
  "code-interpreter": "bg-amber-500",
  memory: "bg-blue-500",
  policy: "bg-rose-500",
  browser: "bg-teal-500",
  observability: "bg-cyan-500",
  "multi-agent": "bg-indigo-500",
  evaluations: "bg-orange-500",
};

const SERVICE_DESCRIPTIONS: Record<string, string> = {
  gateway: "Lambda Tool을 MCP 프로토콜로 연결",
  llm: "Claude Sonnet 4.6 모델로 추론",
  "code-interpreter": "Python 코드 실행 (분석/시각화)",
  memory: "고객 맥락 저장 & 의미 기반 조회",
  policy: "가드레일 규칙 체크 (에스컬레이션)",
  browser: "외부 웹사이트 실시간 정보 수집",
  observability: "실시간 Trace + GenAI Dashboard",
  "multi-agent": "Orchestrator가 적절한 Agent로 라우팅",
  evaluations: "Agent 응답 품질 자동 측정",
};

export function ExecutionFlow({ currentPhase }: ExecutionFlowProps) {
  const activeIds = AGENTCORE_SERVICES.filter((s) => s.phase <= currentPhase).map((s) => s.id);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          AgentCore Services
        </h3>
        <span className="text-[10px] text-zinc-600">
          {activeIds.length} / {AGENTCORE_SERVICES.length} active
        </span>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        {AGENTCORE_SERVICES.map((service, idx) => {
          const isActive = activeIds.includes(service.id);
          const dotColor = SERVICE_COLORS[service.id] || "bg-zinc-600";

          return (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.04 }}
              className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all ${
                isActive
                  ? "bg-zinc-800/40 border border-zinc-700/40"
                  : "opacity-40"
              }`}
            >
              {/* Status dot */}
              <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                isActive ? dotColor : "bg-zinc-700"
              }`} />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] font-medium ${
                    isActive ? "text-zinc-200" : "text-zinc-600"
                  }`}>
                    {service.name}
                  </span>
                  {!isActive && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500 border border-zinc-700/40">
                      Phase {service.phase}
                    </span>
                  )}
                </div>
                {isActive && (
                  <p className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">
                    {SERVICE_DESCRIPTIONS[service.id]}
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Footer: Phase 안내 */}
      <div className="mt-3 pt-3 border-t border-zinc-800 text-[10px] text-zinc-600 leading-relaxed">
        Phase {currentPhase}에서 활성화된 서비스입니다. Agent를 배포하면 이 서비스들이 자동으로 연동됩니다.
      </div>
    </div>
  );
}
