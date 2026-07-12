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
            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => !isLocked && onSelectAgent(agent.id)}
                className={`
                  p-3 rounded-lg transition-all duration-200 border
                  ${isLocked
                    ? "border-white/5 bg-white/[0.01] opacity-40 cursor-not-allowed"
                    : selectedAgent === agent.id
                    ? "border-cyan-500/50 bg-cyan-500/10 cursor-pointer"
                    : "border-white/5 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05] cursor-pointer"
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-base ${isLocked ? "opacity-60" : ""}`}>
                    {agent.icon}
                  </span>
                  <span className={`font-semibold text-[13px] ${isLocked ? "text-zinc-300" : "text-white"}`}>
                    {agent.name}
                  </span>
                </div>
                {agent.description && (
                  <div className={`text-[10px] mt-1 ${isLocked ? "text-zinc-400" : "text-slate-400"}`}>
                    {agent.description}
                  </div>
                )}
                {agent.services && (
                  <div className={`text-[9px] mt-1.5 leading-relaxed ${isLocked ? "text-zinc-500" : "text-cyan-500/80"}`}>
                    {agent.services}
                  </div>
                )}
                {!isLocked && (
                  <div className="text-[11px] text-slate-400 mt-1.5 font-mono">
                    {agent.latency !== null
                      ? `${agent.latency}ms`
                      : "—"}{" "}
                    · {agent.invocations} calls
                  </div>
                )}
                <Badge
                  variant="outline"
                  className={`mt-2 text-[10px] px-2 py-0.5 ${
                    agent.status === "ACTIVE"
                      ? "border-green-500/30 text-green-400 bg-green-500/10"
                      : agent.status === "LOCKED"
                      ? "border-zinc-700/50 text-zinc-600 bg-zinc-800/30"
                      : "border-yellow-500/30 text-yellow-400 bg-yellow-500/10"
                  }`}
                >
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
                      agent.status === "ACTIVE"
                        ? "bg-green-400 animate-pulse-dot"
                        : agent.status === "LOCKED"
                        ? "bg-zinc-600"
                        : "bg-yellow-400"
                    }`}
                  />
                  {agent.status === "LOCKED" ? `Phase ${agent.phase}` : agent.status}
                </Badge>
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
