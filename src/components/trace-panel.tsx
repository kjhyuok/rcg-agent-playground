"use client";

import { motion } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TraceItem, ActivityItem } from "@/lib/types";

interface TracePanelProps {
  traces: TraceItem[];
  sparklineData: number[];
  activities: ActivityItem[];
}

const colorMap = {
  blue: "bg-blue-500",
  green: "bg-green-500",
  orange: "bg-orange-500",
  purple: "bg-purple-500",
};

export function TracePanel({
  traces,
  sparklineData,
  activities,
}: TracePanelProps) {
  return (
    <div className="glass rounded-xl p-4 flex flex-col h-full overflow-hidden">
      <ScrollArea className="flex-1">
        {/* Trace Timeline */}
        <h3 className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-3">
          Trace Timeline
        </h3>
        <div className="flex flex-col gap-2 mb-5">
          {traces.map((trace, i) => (
            <motion.div
              key={`${trace.name}-${i}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="pb-2 border-b border-white/5 last:border-0"
            >
              <div className="text-[12px] font-semibold text-white mb-1">
                {trace.name}
              </div>
              <div className="h-1.5 bg-white/5 rounded-full relative overflow-hidden">
                <motion.div
                  className={`h-full rounded-full absolute ${colorMap[trace.color]}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${trace.widthPercent}%` }}
                  transition={{ duration: 0.5, delay: i * 0.15 }}
                  style={{ left: `${trace.leftPercent}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-500 mt-1 font-mono">
                {trace.startMs}ms — {trace.endMs}ms
              </div>
            </motion.div>
          ))}
        </div>

        {/* Response Latency Sparkline */}
        <h3 className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-3">
          Response Latency
        </h3>
        <div className="flex items-end gap-[2px] h-[36px] mb-5">
          {sparklineData.map((val, i) => (
            <motion.div
              key={i}
              className="w-[4px] bg-cyan-500/60 rounded-sm"
              initial={{ height: 0 }}
              animate={{ height: `${Math.min(100, (val / 300) * 100)}%` }}
              transition={{ duration: 0.3, delay: i * 0.02 }}
            />
          ))}
        </div>

        {/* Activity Feed */}
        <h3 className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-3">
          Activity Feed
        </h3>
        <div className="flex flex-col">
          {activities.map((activity, i) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex gap-2 py-2 border-b border-white/5 last:border-0 text-[11px]"
            >
              <span className="text-slate-500 font-mono whitespace-nowrap">
                {activity.time}
              </span>
              <span className="text-slate-300">{activity.message}</span>
            </motion.div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
