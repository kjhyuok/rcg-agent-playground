"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AGENTCORE_SERVICES } from "@/lib/agentcore-services";

export interface DetectedStep {
  id: string;
  serviceId: string;
  detail: string;
  timestamp: number;
}

interface ExecutionFlowProps {
  currentPhase: number;
  liveLog: DetectedStep[];
  isExecuting: boolean;
  /** true면 실제 Agent 응답 기반 감지, false면 ARN 미설정 상태의 예시 시나리오(Mock) */
  isLive: boolean;
}

const SERVICE_COLORS: Record<string, string> = {
  gateway: "bg-emerald-500",
  llm: "bg-violet-500",
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
  memory: "고객 맥락 저장 & 의미 기반 조회",
  policy: "가드레일 규칙 체크 (에스컬레이션)",
  browser: "외부 웹사이트 실시간 정보 수집",
  observability: "실시간 Trace + GenAI Dashboard",
  "multi-agent": "Orchestrator가 적절한 Agent로 라우팅",
  evaluations: "Agent 응답 품질 자동 측정",
};

export function ExecutionFlow({ currentPhase, liveLog, isExecuting, isLive }: ExecutionFlowProps) {
  const availableIds = AGENTCORE_SERVICES.filter((s) => s.phase <= currentPhase).map((s) => s.id);
  // 이 호출에서 각 서비스가 실제로 무엇을 했는지 — serviceId별로 detail을 모아 카드 안에 바로 노출
  const detailsByService = new Map<string, string[]>();
  for (const step of liveLog) {
    const list = detailsByService.get(step.serviceId) ?? [];
    list.push(step.detail);
    detailsByService.set(step.serviceId, list);
  }
  const hasLog = liveLog.length > 0 || isExecuting;

  return (
    <div className="flex flex-col h-full">
      <div className="mb-1">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            AgentCore Services
          </h3>
          <div className="flex items-center gap-2">
            {hasLog && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                isLive
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : "bg-zinc-700/40 text-zinc-400 border border-zinc-600/40"
              }`}>
                {isLive ? "● LIVE" : "○ MOCK"}
              </span>
            )}
            <span className="text-[10px] text-zinc-600">
              {availableIds.length} / {AGENTCORE_SERVICES.length} available
            </span>
          </div>
        </div>
        <p className="text-[10px] text-zinc-600 leading-relaxed mt-1">
          {hasLog
            ? "방금 호출에서 이 Agent가 실제로 사용한 서비스와 호출 내용입니다."
            : "Agent를 호출하면 이번 요청에서 실제로 사용된 서비스가 여기에 표시됩니다."}
        </p>
      </div>

      <div className="mt-3 space-y-1.5 overflow-y-auto pr-1 flex-1">
        {AGENTCORE_SERVICES.map((service, idx) => {
          const isAvailable = availableIds.includes(service.id);
          const details = detailsByService.get(service.id);
          const isDetected = !!details;
          const dotColor = SERVICE_COLORS[service.id] || "bg-zinc-600";

          return (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.04 }}
              className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all ${
                isDetected
                  ? isLive
                    ? "bg-zinc-800/70 border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                    : "bg-zinc-800/70 border border-zinc-600/50"
                  : isAvailable
                  ? "bg-zinc-800/40 border border-zinc-700/40"
                  : "opacity-40"
              }`}
            >
              {/* Status dot */}
              <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                isDetected ? `${dotColor} animate-pulse-dot` : isAvailable ? dotColor : "bg-zinc-700"
              }`} />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] font-medium ${
                    isDetected ? (isLive ? "text-emerald-300" : "text-zinc-300") : isAvailable ? "text-zinc-200" : "text-zinc-600"
                  }`}>
                    {service.name}
                  </span>
                  {!isAvailable && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500 border border-zinc-700/40">
                      Phase {service.phase}
                    </span>
                  )}
                  {isDetected && isLive && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      감지됨
                    </span>
                  )}
                  {isDetected && !isLive && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/40 text-zinc-400 border border-zinc-600/40">
                      예시
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">
                  {isAvailable ? SERVICE_DESCRIPTIONS[service.id] : `Phase ${service.phase}부터 사용 가능`}
                </p>
                {/* 이번 호출에서 이 서비스가 실제로 처리한 내용 — 카드 안에 바로 노출해 상단 설명과 바로 연결되게 함 */}
                {details && (
                  <AnimatePresence initial={false}>
                    <div className="mt-1.5 space-y-0.5">
                      {details.map((d, i) => (
                        <motion.div
                          key={`${service.id}-${i}`}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            isLive ? "bg-emerald-500/[0.06] text-emerald-200/80" : "bg-white/[0.04] text-zinc-400"
                          }`}
                        >
                          {d}
                        </motion.div>
                      ))}
                    </div>
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <p className="mt-3 pt-3 border-t border-zinc-800 text-[9px] text-zinc-600 leading-relaxed">
        {isLive
          ? "* 실제 응답 내용을 근거로 재구성한 추정 경로입니다 (Runtime API가 중간 이벤트를 제공하지 않아 완전한 실시간은 아님)."
          : hasLog
          ? "* ARN이 설정되지 않아 예시 시나리오를 보여주는 중입니다. Settings에서 ARN을 입력하면 실제 감지 결과로 전환됩니다."
          : "* Settings에서 Agent ARN을 입력하면 실제 호출 결과로 전환됩니다."}
      </p>
    </div>
  );
}
