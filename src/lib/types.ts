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
  demandArn: string;
  customArn: string;
  [key: string]: string;
}

export interface MockResponse {
  tools: string[];
  reply: string;
}
