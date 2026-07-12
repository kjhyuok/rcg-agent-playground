"use client";

import { motion } from "framer-motion";

interface MetricsBarProps {
  latency: number;
  tokens: number;
  cost: number;
  requests: number;
  successRate: number;
  currentPhase: number;
  activeAgents: number;
}

const PHASE_STEPS = [
  { phase: 1, label: "추천 Agent", description: "Gateway + Runtime" },
  { phase: 2, label: "CS / 수요예측", description: "+ Memory + Policy" },
  { phase: 3, label: "커스텀 Agent", description: "+ Multi-Agent" },
  { phase: 4, label: "Arena", description: "벤치마크 제출" },
];

export function MetricsBar({
  latency,
  tokens,
  cost,
  requests,
  currentPhase,
  activeAgents,
}: MetricsBarProps) {
  return (
    <motion.div
      className="flex flex-col items-center gap-2 px-6 py-3 border-b border-white/5"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      {/* Phase Progress — 중앙, 가로 길게 */}
      <div className="flex items-center justify-center w-full max-w-2xl">
        {PHASE_STEPS.map((step, idx) => {
          const isCompleted = step.phase < currentPhase || (step.phase === currentPhase && activeAgents > 0);
          const isCurrent = step.phase === currentPhase;

          return (
            <div key={step.phase} className="flex items-center flex-1">
              {/* Step dot + label */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full transition-all flex-shrink-0 ${
                    isCompleted
                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                      : isCurrent
                      ? "bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.5)] animate-pulse"
                      : "bg-zinc-700 border border-zinc-600"
                  }`}
                />
                <span
                  className={`text-[11px] font-medium whitespace-nowrap ${
                    isCompleted
                      ? "text-emerald-300"
                      : isCurrent
                      ? "text-cyan-300"
                      : "text-zinc-500"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {idx < PHASE_STEPS.length - 1 && (
                <div
                  className={`flex-1 h-[2px] mx-3 rounded ${
                    step.phase < currentPhase ? "bg-emerald-500/60" : "bg-zinc-800"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Last invoke summary — 조건부 표시 */}
      {requests > 0 && (
        <motion.div
          className="flex items-center gap-3 text-[11px] bg-white/[0.03] border border-white/8 rounded-full px-4 py-1"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          key={requests}
        >
          <span className="text-zinc-500">Last invoke:</span>
          {latency > 0 && (
            <>
              <span className="text-cyan-400 font-mono">
                {latency > 1000 ? `${(latency / 1000).toFixed(1)}s` : `${latency}ms`}
              </span>
              <span className="text-zinc-700">·</span>
            </>
          )}
          {tokens > 0 && (
            <>
              <span className="text-purple-400 font-mono">{tokens.toLocaleString()} tok</span>
              <span className="text-zinc-700">·</span>
            </>
          )}
          {cost > 0 && (
            <>
              <span className="text-emerald-400 font-mono">₩{Math.round(cost * 1400)}</span>
              <span className="text-zinc-700">·</span>
            </>
          )}
          <span className="text-emerald-400">✓</span>
        </motion.div>
      )}
    </motion.div>
  );
}
