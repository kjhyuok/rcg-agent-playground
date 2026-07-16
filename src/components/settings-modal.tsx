"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AgentSettings } from "@/lib/types";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AgentSettings;
  onSettingsChange: (settings: AgentSettings) => void;
}

const AGENT_FIELDS = [
  { key: "recommendArn" as const, icon: "🛒", name: "추천 Agent", phase: 1, placeholder: "arn:aws:bedrock-agentcore:us-east-1:...:runtime/rcg_recommend_agent-..." },
  { key: "csArn" as const, icon: "💬", name: "CS Agent", phase: 2, placeholder: "arn:aws:bedrock-agentcore:us-east-1:...:runtime/rcg_cs_agent-..." },
  { key: "customArn" as const, icon: "⚙️", name: "커스텀 Agent", phase: 3, placeholder: "arn:aws:bedrock-agentcore:us-east-1:...:runtime/my_custom_agent-..." },
];

export function SettingsModal({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
}: SettingsModalProps) {
  const activeCount = AGENT_FIELDS.filter(
    (f) => settings[f.key] && settings[f.key].trim() !== ""
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white text-base flex items-center gap-2">
            Agent 설정
            <span className="text-[11px] font-normal text-zinc-500">
              {activeCount}/{AGENT_FIELDS.length} 연결됨
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-2">
          {/* Agent ARNs */}
          <div>
            <p className="text-[11px] text-zinc-500 mb-3">
              Phase별로 배포한 Agent의 ARN을 입력하세요. 입력하면 해당 Agent 카드가 활성화됩니다.
            </p>

            <div className="flex flex-col gap-3">
              {AGENT_FIELDS.map((field) => {
                const value = settings[field.key] || "";
                const isConnected = value.trim() !== "";

                return (
                  <div key={field.key}>
                    <label className="text-[12px] text-slate-400 flex items-center gap-2 mb-1.5">
                      <span>{field.icon}</span>
                      <span>{field.name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                        Phase {field.phase}
                      </span>
                      {isConnected && (
                        <span className="ml-auto text-[10px] text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          연결됨
                        </span>
                      )}
                    </label>
                    <Input
                      value={value}
                      onChange={(e) =>
                        onSettingsChange({
                          ...settings,
                          [field.key]: e.target.value,
                        })
                      }
                      placeholder={field.placeholder}
                      className={`bg-white/[0.05] border-white/10 text-white text-[11px] font-mono placeholder:text-slate-700 ${
                        isConnected ? "border-emerald-500/30" : ""
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 mt-2">
            <Button
              onClick={() => onOpenChange(false)}
              className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
            >
              저장
            </Button>
            <Button
              onClick={() => {
                onSettingsChange({
                  recommendArn: "",
                  csArn: "",
                  customArn: "",
                });
              }}
              variant="ghost"
              className="text-zinc-500 hover:text-zinc-300"
            >
              초기화
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
