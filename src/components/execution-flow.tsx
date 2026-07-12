"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  AGENTCORE_SERVICES,
  type ExecutionStep,
  type ServiceStatus,
} from "@/lib/agentcore-services";

interface ExecutionFlowProps {
  steps: ExecutionStep[];
  currentPhase: number;
  isExecuting: boolean;
}

function StatusDot({ status }: { status: ServiceStatus }) {
  switch (status) {
    case "active":
      return (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
        </span>
      );
    case "done":
      return (
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      );
    case "error":
      return (
        <span className="inline-flex h-2 w-2 rounded-full bg-red-400" />
      );
    default:
      return (
        <span className="inline-flex h-2 w-2 rounded-full bg-zinc-700" />
      );
  }
}

// 서비스별 색상 (이모지 대신 컬러 바 + 텍스트)
const SERVICE_COLORS: Record<string, string> = {
  gateway: "border-l-emerald-500",
  llm: "border-l-violet-500",
  "code-interpreter": "border-l-amber-500",
  memory: "border-l-blue-500",
  policy: "border-l-rose-500",
  browser: "border-l-teal-500",
  observability: "border-l-cyan-500",
  "multi-agent": "border-l-indigo-500",
  evaluations: "border-l-orange-500",
};

function getServiceSteps(serviceId: string, steps: ExecutionStep[]) {
  return steps.filter((s) => s.serviceId === serviceId);
}

export function ExecutionFlow({
  steps,
  currentPhase,
  isExecuting,
}: ExecutionFlowProps) {
  const activeServiceIds = AGENTCORE_SERVICES.filter(
    (s) => s.phase <= currentPhase
  ).map((s) => s.id);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Execution Flow
        </h3>
        <span className="text-[10px] text-zinc-600">
          {activeServiceIds.length} / {AGENTCORE_SERVICES.length} active
        </span>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto pr-1">
        <AnimatePresence mode="popLayout">
          {AGENTCORE_SERVICES.map((service, idx) => {
            const isActive = activeServiceIds.includes(service.id);
            const serviceSteps = getServiceSteps(service.id, steps);
            const hasSteps = serviceSteps.length > 0;
            const isCurrentlyActive =
              isExecuting &&
              serviceSteps.some((s) => s.status === "active");
            const borderColor = SERVICE_COLORS[service.id] || "border-l-zinc-700";

            // 비활성 서비스 (Phase 미도달) — 보이지만 잠김
            if (!isActive) {
              return (
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-zinc-800/20 border border-zinc-700/30"
                >
                  <span className="inline-flex h-2 w-2 rounded-full bg-zinc-600/50 border border-zinc-600" />
                  <span className="text-[11px] text-zinc-500 flex-1">
                    {service.name}
                  </span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-zinc-700/40 text-zinc-400 border border-zinc-600/40">
                    Phase {service.phase}
                  </span>
                </motion.div>
              );
            }

            // 활성 서비스
            return (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: idx * 0.03,
                  type: "spring",
                  stiffness: 300,
                  damping: 25,
                }}
                className={`
                  rounded-lg border-l-2 border border-zinc-800/40 transition-all duration-300
                  ${borderColor}
                  ${hasSteps ? "bg-zinc-900/60" : "bg-zinc-900/20"}
                  ${isCurrentlyActive ? "border-r-cyan-500/40 border-t-cyan-500/20 border-b-cyan-500/20 shadow-[0_0_8px_rgba(6,182,212,0.1)]" : ""}
                `}
              >
                {/* Service Header */}
                <div className="flex items-center gap-2.5 px-3 py-2">
                  {hasSteps ? (
                    <StatusDot status={serviceSteps[serviceSteps.length - 1].status} />
                  ) : (
                    <span className="inline-flex h-2 w-2 rounded-full bg-zinc-700/50" />
                  )}
                  <span
                    className={`text-[12px] font-medium flex-1 ${
                      hasSteps ? "text-zinc-100" : "text-zinc-400"
                    }`}
                  >
                    {service.name}
                  </span>
                  {hasSteps && (
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {serviceSteps.reduce((sum, s) => sum + (s.latencyMs || 0), 0) > 1000
                        ? `${(serviceSteps.reduce((sum, s) => sum + (s.latencyMs || 0), 0) / 1000).toFixed(1)}s`
                        : `${serviceSteps.reduce((sum, s) => sum + (s.latencyMs || 0), 0)}ms`}
                    </span>
                  )}
                </div>

                {/* Service Steps (expanded when has data) */}
                <AnimatePresence>
                  {hasSteps && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="px-3 pb-2 space-y-0.5"
                    >
                      {serviceSteps.map((step, i) => (
                        <motion.div
                          key={`${step.serviceId}-${i}`}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.08 }}
                          className="flex items-center gap-2 pl-4 text-[10px] py-0.5"
                        >
                          <StatusDot status={step.status} />
                          <span className="text-zinc-400 flex-1 truncate">
                            {step.detail}
                          </span>
                          {step.latencyMs !== undefined && step.latencyMs > 0 && (
                            <span className="text-zinc-600 font-mono">
                              {step.latencyMs > 1000
                                ? `${(step.latencyMs / 1000).toFixed(1)}s`
                                : `${step.latencyMs}ms`}
                            </span>
                          )}
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Bottom: Total execution summary */}
      {steps.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between text-[10px] text-zinc-500"
        >
          <span>
            {steps.filter((s) => s.status === "done").length} steps completed
          </span>
          <span className="font-mono text-zinc-400">
            {(
              steps.reduce((sum, s) => sum + (s.latencyMs || 0), 0) / 1000
            ).toFixed(1)}s total
          </span>
        </motion.div>
      )}
    </div>
  );
}
