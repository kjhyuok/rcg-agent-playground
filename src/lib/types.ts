export interface Agent {
  id: number;
  name: string;
  icon: string;
  status: "ACTIVE" | "IDLE" | "LOCKED";
  latency: number | null;
  invocations: number;
  phase?: number;
  description?: string;
  services?: string;
}

export interface ChatMessage {
  id: string;
  type: "user" | "agent" | "tool";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  /** 응답 생성 중 "생각 중" 체크리스트로 표시할 단계들 */
  thinkingSteps?: ThinkingStep[];
  /** true=실제 Agent 응답 기반 추정, false=ARN 미설정 Mock 시나리오 */
  isLive?: boolean;
}

export interface ThinkingStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
}

export interface TraceItem {
  name: string;
  color: "blue" | "green" | "orange" | "purple";
  widthPercent: number;
  leftPercent: number;
  startMs: number;
  endMs: number;
}

export interface ActivityItem {
  id: string;
  time: string;
  message: string;
}

export interface AgentSettings {
  recommendArn: string;
  csArn: string;
  customArn: string;
  [key: string]: string;
}

export interface MockResponse {
  tools: string[];
  reply: string;
}
