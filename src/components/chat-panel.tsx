"use client";

import { useRef, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ChatMessage, ThinkingStep } from "@/lib/types";

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

// 최종 응답을 문단/리스트/헤딩 단위 블록으로 쪼갠다 (빈 줄 기준).
// 스트리밍이 끝난 뒤 이 블록들을 순차적으로 fade-in시켜 "구조가 드러나는" 느낌을 낸다.
function splitIntoBlocks(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
}

// 스트리밍 중에는 매 청크(수 ms)마다가 아니라 일정 간격으로만 마크다운을 다시 그린다.
// 헤딩/코드블록/표 같은 구조가 스트리밍 도중에도 계속 보이도록 하면서(plain text로
// 보이면 뭉친 텍스트처럼 읽힘), 청크 도착 타이밍과 렌더 비용이 겹쳐 끊기는 것도 방지.
function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdateRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdateRef.current;

    if (elapsed >= intervalMs) {
      lastUpdateRef.current = now;
      setThrottled(value);
      return;
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      lastUpdateRef.current = Date.now();
      setThrottled(value);
    }, intervalMs - elapsed);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value, intervalMs]);

  return throttled;
}

function ThinkingChecklist({ steps, isLive }: { steps: ThinkingStep[]; isLive?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <AnimatePresence initial={false}>
        {steps.map((step) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 text-[12px]"
          >
            {step.status === "done" ? (
              <span className="text-emerald-400">✓</span>
            ) : (
              <span className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
            <span className={step.status === "done" ? "text-zinc-500" : "text-zinc-300"}>
              {step.label}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
      {steps.length > 0 && (
        <span className="text-[9px] text-zinc-600 mt-0.5">
          {isLive ? "* 응답 내용을 근거로 추정한 진행 단계입니다" : "* 예시 시나리오 (Mock)"}
        </span>
      )}
    </div>
  );
}

const MARKDOWN_CLASSES =
  "prose prose-invert prose-sm max-w-none " +
  "prose-p:my-2.5 prose-p:leading-[1.75] " +
  "prose-headings:mt-4 prose-headings:mb-2 prose-headings:text-cyan-300 " +
  "prose-li:my-1 prose-li:leading-[1.7] prose-ul:my-2.5 prose-ol:my-2.5 " +
  "prose-table:text-[11px] prose-th:px-2 prose-th:py-1.5 prose-td:px-2 prose-td:py-1.5 " +
  "prose-table:border-zinc-700 prose-th:border-zinc-700 prose-td:border-zinc-700 " +
  "prose-strong:text-white prose-a:text-cyan-400 prose-hr:border-zinc-700 prose-hr:my-4 " +
  "prose-blockquote:border-cyan-500/40 prose-blockquote:text-zinc-400 prose-blockquote:not-italic " +
  "prose-code:text-amber-300 prose-code:bg-black/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none " +
  "prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-lg";

function AnimatedMarkdown({ content }: { content: string }) {
  const blocks = useMemo(() => splitIntoBlocks(content), [content]);

  return (
    <div className={MARKDOWN_CLASSES}>
      {blocks.map((block, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.25 }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{block}</ReactMarkdown>
        </motion.div>
      ))}
    </div>
  );
}

function AgentMessageBubble({ msg, alreadyAnimated }: { msg: ChatMessage; alreadyAnimated: boolean }) {
  const hasThinkingSteps = (msg.thinkingSteps?.length ?? 0) > 0;
  const isWaiting = msg.isStreaming && msg.content === "" && !hasThinkingSteps;
  // 스트리밍 중에는 매 청크가 아니라 200ms마다만 마크다운을 다시 그려
  // 헤딩/코드블록/표 구조가 계속 보이면서도 렌더 비용을 억제한다.
  const throttledContent = useThrottledValue(msg.content, 200);

  return (
    <div className="glass px-4 py-3 rounded-2xl rounded-bl-md text-[13px] leading-relaxed text-slate-200">
      {isWaiting ? (
        <div className="flex items-center gap-1.5 py-1">
          <span className="typing-dot w-1.5 h-1.5 rounded-full bg-cyan-400" />
          <span className="typing-dot w-1.5 h-1.5 rounded-full bg-cyan-400" />
          <span className="typing-dot w-1.5 h-1.5 rounded-full bg-cyan-400" />
        </div>
      ) : msg.isStreaming && msg.content === "" ? (
        // 아직 텍스트는 안 왔지만 실행 단계(Tool 호출 등)가 감지된 상태 —
        // "생각 중" 체크리스트로 표시. isLive=false면 예시 시나리오임을 명시한다.
        <ThinkingChecklist steps={msg.thinkingSteps || []} isLive={msg.isLive} />
      ) : msg.isStreaming ? (
        <>
          <div className={MARKDOWN_CLASSES}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{throttledContent}</ReactMarkdown>
          </div>
          <span className="inline-block w-[2px] h-[14px] bg-cyan-400 ml-0.5 animate-pulse" />
        </>
      ) : alreadyAnimated ? (
        // 최초 1회만 블록 단위 fade-in, 이후 리렌더는 정적으로 표시
        <div className={MARKDOWN_CLASSES}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
        </div>
      ) : (
        <AnimatedMarkdown content={msg.content} />
      )}
    </div>
  );
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
  // 스트리밍이 막 끝난 메시지만 블록 fade-in 애니메이션을 1회 적용하고,
  // 그 이후(예: 다른 메시지 도착으로 리렌더될 때)는 정적으로 표시해 매번 재생되지 않게 한다.
  const [animatedIds, setAnimatedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    messages.forEach((m) => {
      if (m.type === "agent" && !m.isStreaming && m.content && !animatedIds.has(m.id)) {
        setAnimatedIds((prev) => new Set(prev).add(m.id));
      }
    });
  }, [messages, animatedIds]);

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

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="self-start max-w-[85%]"
              >
                <AgentMessageBubble msg={msg} alreadyAnimated={animatedIds.has(msg.id)} />
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
