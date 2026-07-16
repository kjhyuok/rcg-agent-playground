"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Agent } from "@/lib/types";

interface AgentSidebarProps {
  agents: Agent[];
  selectedAgent: number;
  onSelectAgent: (id: number) => void;
}

export function AgentSidebar({
  agents,
  selectedAgent,
  onSelectAgent,
}: AgentSidebarProps) {
  return (
    <div className="glass rounded-xl p-4 flex flex-col h-full">
      <h2 className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-3">
        에이전트 목록
      </h2>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2">
          {agents.map((agent, index) => {
            const isLocked = agent.status === "LOCKED";
            const isSelected = selectedAgent === agent.id;
            // 선택된 카드는 LOCKED라도 밝게 강조한다 — 지금 체험 중인 Agent가
            // 다른 잠긴 카드와 구분되지 않으면 "내가 뭘 쓰고 있는지" 알 수 없기 때문.
            const dimmed = isLocked && !isSelected;
            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => !isLocked && onSelectAgent(agent.id)}
                className={`
                  relative p-3 rounded-lg transition-all duration-200 border overflow-hidden
                  ${isSelected
                    ? "border-cyan-500/50 bg-cyan-500/10"
                    : dimmed
                    ? "border-white/5 bg-white/[0.01] opacity-45"
                    : "border-white/5 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05] cursor-pointer"
                  }
                  ${isLocked && !isSelected ? "cursor-not-allowed" : "cursor-pointer"}
                `}
              >
                {/* 선택 카드 좌측 accent bar */}
                {isSelected && (
                  <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-cyan-400 rounded-r" />
                )}
                <div className="flex items-center gap-2">
                  <span className={`text-base ${dimmed ? "opacity-60" : ""}`}>
                    {agent.icon}
                  </span>
                  <span className={`font-semibold text-[13px] flex-1 ${dimmed ? "text-zinc-300" : "text-white"}`}>
                    {agent.name}
                  </span>
                  {isLocked && !isSelected && (
                    <span className="text-[11px] text-zinc-500" title={`Phase ${agent.phase} 배포 시 잠금 해제`}>
                      🔒
                    </span>
                  )}
                </div>
                {agent.description && (
                  <div className={`text-[10px] mt-1 ${isLocked ? "text-zinc-400" : "text-slate-400"}`}>
                    {agent.description}
                  </div>
                )}
                {agent.services && (
                  <div className={`text-[9px] mt-1.5 leading-relaxed ${dimmed ? "text-zinc-500" : "text-cyan-500/80"}`}>
                    {agent.services}
                  </div>
                )}
                {(agent.status === "ACTIVE" || isSelected) && (
                  <div className="text-[11px] text-slate-400 mt-1.5 font-mono">
                    {agent.latency !== null
                      ? `${agent.latency}ms`
                      : "—"}{" "}
                    · {agent.invocations} calls
                  </div>
                )}
                {(() => {
                  // 배지 상태 결정:
                  //  - ACTIVE: ARN 연결됨
                  //  - 선택된 LOCKED: 체험 가능(Mock) — 잠김이 아니라 "체험 중"으로 표시
                  //  - 그 외 LOCKED: Phase N 잠김
                  if (agent.status === "ACTIVE") {
                    return (
                      <Badge variant="outline" className="mt-2 text-[10px] px-2 py-0.5 border-green-500/30 text-green-400 bg-green-500/10">
                        <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 bg-green-400 animate-pulse-dot" />
                        ACTIVE
                      </Badge>
                    );
                  }
                  if (isSelected) {
                    return (
                      <Badge variant="outline" className="mt-2 text-[10px] px-2 py-0.5 border-cyan-500/30 text-cyan-300 bg-cyan-500/10">
                        <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 bg-cyan-400 animate-pulse-dot" />
                        체험 중 · Mock
                      </Badge>
                    );
                  }
                  return (
                    <Badge variant="outline" className="mt-2 text-[10px] px-2 py-0.5 border-zinc-700/50 text-zinc-500 bg-zinc-800/30">
                      <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 bg-zinc-600" />
                      Phase {agent.phase} 잠김
                    </Badge>
                  );
                })()}
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
