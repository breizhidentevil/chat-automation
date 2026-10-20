export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface DiagnosticEvent {
  timestamp: number;
  level: LogLevel;
  site: string;
  event: string;
  details?: string;
  strategy?: string;
  durationMs?: number;
}

export type SendStrategy =
  | { method: 'button'; selector: string; confidence: number }
  | { method: 'enter'; confidence: number }
  | { method: 'unknown'; confidence: number };

export interface ChatSiteProcedure {
  origin: string;
  schemaVersion: 2;
  inputSelector: string;
  /** Ordered, validated alternatives for recovering the same input after DOM changes. */
  inputSelectors?: string[];
  sendStrategy: SendStrategy;
  updatedAt: number;
  lastSuccessAt?: number;
  successCount: number;
  failureCount: number;
}

export interface Candidate {
  element: HTMLElement;
  score: number;
  reasons: string[];
}
