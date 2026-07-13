"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/types";

interface ChatPanelProps {
  messages: ChatMessage[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  agentName: string;
  disabled?: boolean;
  presetQuestions?: string[];
  onPresetSelect?: (question: string) => void;
}

export function ChatPanel({
  messages,
  inputValue,
  onInputChange,
  onSend,
  agentName,
  disabled = false,
  presetQuestions = [],
  onPresetSelect,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="glass rounded-xl flex flex-col h-full overflow-hidden">
      {/* Chat Header */}
      <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-white">
          Invoke Agent
        </span>
        <span className="text-[11px] text-slate-400 font-mono">
          {agentName}
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-3"
      >
        <AnimatePresence mode="popLayout">
          {messages.map((msg) => {
            if (msg.type === "user") {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="self-end max-w-[75%]"
                >
                  <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-4 py-2.5 rounded-2xl rounded-br-md text-[13px] leading-relaxed">
                    {msg.content}
                  </div>
                </motion.div>
              );
            }

            if (msg.type === "tool") {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="self-start"
                >
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px] font-mono">
                    <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    <span>Calling: {msg.content}()</span>
                  </div>
                </motion.div>
              );
            }

            const isWaiting = msg.isStreaming && msg.content === "";

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="self-start max-w-[85%]"
              >
                <div className="glass px-4 py-3 rounded-2xl rounded-bl-md text-[13px] leading-relaxed text-slate-200">
                  {isWaiting ? (
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    </div>
                  ) : (
                    <>
                      <div className="prose prose-invert prose-sm max-w-none prose-table:text-[11px] prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-table:border-zinc-700 prose-th:border-zinc-700 prose-td:border-zinc-700 prose-headings:text-cyan-300 prose-strong:text-white prose-a:text-cyan-400">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                      {msg.isStreaming && (
                        <span className="inline-block w-[2px] h-[14px] bg-cyan-400 ml-0.5 animate-pulse" />
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Preset 질문 칩 */}
      {presetQuestions.length > 0 && (
        <div className="px-3 pt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
          {presetQuestions.map((q, i) => (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onPresetSelect?.(q)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] text-slate-300 bg-white/[0.04] border border-white/10 hover:bg-cyan-500/10 hover:border-cyan-500/30 hover:text-cyan-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="p-3 border-t border-white/10">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !disabled && onSend()}
            placeholder={disabled ? "Agent 실행 중..." : "Agent에 질의하세요... (Enter로 전송)"}
            disabled={disabled}
            className="flex-1 bg-white/[0.05] border-white/10 text-white placeholder:text-slate-500 text-[13px] focus-visible:ring-cyan-500/50 disabled:opacity-50"
          />
          <Button
            onClick={onSend}
            disabled={disabled}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-[13px] px-5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {disabled ? "..." : "Invoke"}
          </Button>
        </div>
      </div>
    </div>
  );
}
