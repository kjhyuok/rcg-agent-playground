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
  /** 응답 완료 후 대화 맥락 기반으로 추천되는 다음 질문 */
  followUpQuestions?: string[];
  onPresetSelect?: (question: string) => void;
  /** empty state(대화 시작 전)에 표시할 Agent 메타 */
  agentIcon?: string;
  agentDescription?: string;
  agentServices?: string;
}

// 최종 응답을 문단/리스트/헤딩 단위 블록으로 쪼갠다 (빈 줄 기준).
// 스트리밍이 끝난 뒤 이 블록들을 순차적으로 fade-in시켜 "구조가 드러나는" 느낌을 낸다.
function splitIntoBlocks(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
}

// 타자기(typewriter) 렌더.
// Agent는 Tool 호출 동안 몇 초 침묵하다가 최종 답변을 짧은 시간에 몰아서 뱉는다.
// 그래서 "누적 content"를 그대로 그리면 네트워크는 스트리밍이어도 화면엔 한 번에 뜬 것처럼
// 보인다. 이 훅은 목표 텍스트(target)를 향해 표시 길이를 매 프레임 조금씩 따라잡아,
// 청크가 몰려와도 글자가 자연스럽게 흐르게 만든다. 뒤처질수록 빠르게 따라잡아
// 응답이 밀리지 않는다. 스트리밍이 끝나면 즉시 전체를 표시한다.
function useTypewriter(target: string, isStreaming: boolean): string {
  const [len, setLen] = useState(isStreaming ? 0 : target.length);
  const targetRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    if (!isStreaming) {
      setLen(targetRef.current.length);
      return;
    }
    let raf = 0;
    const tick = () => {
      setLen((cur) => {
        const goal = targetRef.current.length;
        if (cur >= goal) return cur;
        // 남은 글자가 많을수록 크게 전진 → 밀린 청크를 빠르게 흡수하되 최소 2자씩
        const step = Math.max(2, Math.ceil((goal - cur) / 10));
        return Math.min(goal, cur + step);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isStreaming]);

  return target.slice(0, len);
}

function ThinkingChecklist({ steps, isLive }: { steps: ThinkingStep[]; isLive?: boolean }) {
  return (
    <div className="flex flex-col py-1">
      <AnimatePresence initial={false}>
        {steps.map((step, i) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-stretch gap-2.5"
          >
            <div className="flex flex-col items-center">
              {step.status === "done" ? (
                <span className="w-4 h-4 rounded-full border-[1.5px] border-emerald-400 text-emerald-400 flex items-center justify-center text-[10px] flex-shrink-0">
                  ✓
                </span>
              ) : (
                <span className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
              {i < steps.length - 1 && (
                <span className="w-px flex-1 min-h-[10px] bg-zinc-700 mt-0.5" />
              )}
            </div>
            <span
              className={`text-[12px] pb-2.5 ${step.status === "done" ? "text-zinc-300 font-medium" : "text-zinc-400"}`}
            >
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
  // 스트리밍 중에는 타자기 효과로 표시 — 청크가 몰려와도 글자가 흐르게 보인다.
  const typedContent = useTypewriter(msg.content, !!msg.isStreaming);

  return (
    <div className="relative agent-bubble px-4 py-3 rounded-2xl rounded-bl-md text-[13px] leading-relaxed text-slate-200 overflow-hidden">
      {isWaiting ? (
        <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-white/[0.06] text-zinc-400 text-[12px]">
          Generating response
        </span>
      ) : msg.isStreaming && msg.content === "" ? (
        // 아직 텍스트는 안 왔지만 실행 단계(Tool 호출 등)가 감지된 상태 —
        // "생각 중" 체크리스트로 표시. isLive=false면 예시 시나리오임을 명시한다.
        <ThinkingChecklist steps={msg.thinkingSteps || []} isLive={msg.isLive} />
      ) : msg.isStreaming ? (
        <>
          <div className={MARKDOWN_CLASSES}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{typedContent}</ReactMarkdown>
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
      {/* 응답 생성 중에는 계속, 완료 직후엔 짧게 흐르다 사라지는 하단 shimmer 라인 */}
      <AnimatePresence>
        {(msg.isStreaming || !alreadyAnimated) && (
          <motion.span
            key="shimmer"
            initial={{ opacity: msg.isStreaming ? 1 : 0.9 }}
            animate={{ opacity: msg.isStreaming ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: msg.isStreaming ? 0.2 : 1.4 }}
            className="shimmer-bar absolute bottom-0 left-0 right-0 h-[2px]"
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// 대화 시작 전 중앙 안내 화면 — 빈 채팅 공간을 Agent 소개 + 예시 질문 카드로 채운다.
function EmptyState({
  agentIcon,
  agentName,
  agentDescription,
  agentServices,
  presetQuestions,
  disabled,
  onPresetSelect,
}: {
  agentIcon?: string;
  agentName: string;
  agentDescription?: string;
  agentServices?: string;
  presetQuestions: string[];
  disabled: boolean;
  onPresetSelect?: (q: string) => void;
}) {
  return (
    <motion.div
      key="empty"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-full text-center px-6 py-8"
    >
      {/* Agent 아이콘 — glow ring */}
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-2xl bg-cyan-500/20 blur-xl" />
        <div className="relative w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-3xl">
          {agentIcon || "🤖"}
        </div>
      </div>

      <h3 className="text-[15px] font-semibold text-white">{agentName}</h3>
      {agentDescription && (
        <p className="mt-1 text-[12px] text-slate-400 max-w-[340px] leading-relaxed">
          {agentDescription}
        </p>
      )}
      {agentServices && (
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
          {agentServices
            .replace(/^\+\s*/, "")
            .split("·")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-full text-[10px] text-cyan-300/80 bg-cyan-500/[0.07] border border-cyan-500/20"
              >
                {s}
              </span>
            ))}
        </div>
      )}

      {/* 예시 질문 카드 */}
      {presetQuestions.length > 0 && (
        <div className="mt-7 w-full max-w-[420px]">
          <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2 font-semibold">
            이렇게 물어보세요
          </p>
          <div className="flex flex-col gap-2">
            {presetQuestions.map((q, i) => (
              <motion.button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => onPresetSelect?.(q)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                className="group flex items-center gap-2.5 text-left px-3.5 py-2.5 rounded-xl text-[12px] text-slate-300 bg-white/[0.03] border border-white/10 hover:bg-cyan-500/[0.08] hover:border-cyan-500/30 hover:text-cyan-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="text-cyan-500/70 group-hover:text-cyan-400 transition-colors">
                  ↗
                </span>
                <span className="flex-1">{q}</span>
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
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
  followUpQuestions = [],
  onPresetSelect,
  agentIcon,
  agentDescription,
  agentServices,
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

  // 아직 사용자가 아무 질문도 안 한 상태(환영 메시지만) → Agent 소개 empty state 노출
  const conversationStarted = messages.some((m) => m.type === "user");

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

      {/* Messages / Empty State */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-3"
      >
        {!conversationStarted ? (
          <EmptyState
            agentIcon={agentIcon}
            agentName={agentName}
            agentDescription={agentDescription}
            agentServices={agentServices}
            presetQuestions={presetQuestions}
            disabled={disabled}
            onPresetSelect={onPresetSelect}
          />
        ) : (
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
                  <div className="bg-gradient-to-r from-blue-600/75 to-cyan-600/75 text-white/95 px-4 py-2.5 rounded-2xl rounded-br-md text-[13px] leading-relaxed">
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
        )}
      </div>

      {/* 대화 시작 후 입력창 위 질문 추천.
          - 응답 완료 & 맥락 기반 followUp이 있으면: 아래에서 팝업처럼 등장하는 강조 섹션
          - 그 외(실행 중 등): 고정 preset 칩으로 폴백 */}
      {conversationStarted && (
        <AnimatePresence mode="wait">
          {!disabled && followUpQuestions.length > 0 ? (
            <motion.div
              key="followups"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="px-3 pt-2.5"
            >
              <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
                <span className="text-cyan-500/70 text-[10px]">✨</span>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                  이어서 물어보기
                </span>
              </div>
              {/* 가로 1줄 3열 — 채팅 흐름을 방해하지 않도록 컴팩트하고 톤다운된 카드 */}
              <div className="grid grid-cols-3 gap-1.5">
                {followUpQuestions.map((q, i) => (
                  <motion.button
                    key={q}
                    type="button"
                    disabled={disabled}
                    onClick={() => onPresetSelect?.(q)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.06 + i * 0.06, duration: 0.25 }}
                    title={q}
                    className="group flex items-start gap-1.5 text-left px-2.5 py-2 rounded-lg text-[11px] leading-snug text-slate-400 bg-white/[0.025] border border-white/[0.07] hover:bg-cyan-500/[0.06] hover:border-cyan-500/25 hover:text-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="text-zinc-600 group-hover:text-cyan-400/70 transition-colors flex-shrink-0 mt-px">↗</span>
                    <span className="flex-1 line-clamp-2">{q}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : presetQuestions.length > 0 ? (
            <motion.div
              key="presets"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-3 pt-2.5 flex gap-1.5 overflow-x-auto pb-0.5"
            >
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
            </motion.div>
          ) : null}
        </AnimatePresence>
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
            className="flex-1 bg-[#0d1420] border border-cyan-500/40 text-white placeholder:text-slate-500 text-[13px] shadow-[0_0_0_1px_rgba(6,182,212,0.06),0_0_18px_-8px_rgba(6,182,212,0.5)] focus-visible:border-cyan-400/70 focus-visible:ring-2 focus-visible:ring-cyan-500/40 disabled:opacity-50 transition-colors"
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
