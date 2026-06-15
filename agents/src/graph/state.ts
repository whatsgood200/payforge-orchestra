import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

// ─────────────────────────────────────────────────────────────────────────────
// Core domain types
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentStatus =
  | "pending"
  | "fx_quoting"
  | "fx_quoted"
  | "policy_checking"
  | "policy_approved"
  | "policy_rejected"
  | "executing"
  | "awaiting_confirmation"
  | "settled"
  | "failed"
  | "retrying";

export interface PaymentRequest {
  amount: string;          // in wei (18 decimals), as bigint string
  fromCurrency: `0x${string}`;  // token address
  toCurrency: `0x${string}`;    // token address (same = no FX swap)
  recipient: `0x${string}`;
  business: `0x${string}`;
  memo: string;
  requestedAt: string;     // ISO timestamp
}

export interface FXQuote {
  exchangeProvider: `0x${string}`;
  exchangeId: `0x${string}`;
  amountOut: string;       // wei string
  amountOutFormatted: string;  // human-readable
  rate: string;            // 1 fromCurrency = X toCurrency
  slippageBps: number;     // basis points (100 = 1%)
  minAmountOut: string;    // amountOut * (1 - slippage), wei string
  quotedAt: string;        // ISO timestamp — quotes expire after 30s
  path: string[];          // token address path
}

export interface PolicyDecision {
  approved: boolean;
  reason: string;
  dailyLimitUsed: string;  // wei string
  dailyLimitTotal: string; // wei string
  utilizationPct: number;  // 0-100
  riskScore: number;       // 0-100, computed by LLM risk assessment
  riskNotes: string;       // LLM reasoning about risk
  checkedAt: string;       // ISO timestamp
}

export interface ExecutionResult {
  txHash: `0x${string}`;
  blockNumber: number;
  gasUsed: string;
  feeCurrency: `0x${string}`;
  gasCostCUSD: string;     // human-readable
  confirmedAt: string;     // ISO timestamp
}

export interface AttestationResult {
  attestationId: number;
  txHash: `0x${string}`;
  onchainUrl: string;      // celoscan link
  erc8004FeedbackSubmitted: boolean;
  settledAt: string;       // ISO timestamp
}

export interface TraceEntry {
  agentId: string;        // "supervisor" | "fx-router" | "policy" | "execution" | "reconciliation"
  step: string;
  summary: string;        // human-readable one-liner for dashboard
  detail?: string;        // full reasoning for debug
  timestamp: string;      // ISO timestamp
  durationMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// LangGraph State — shared across all agent nodes
// ─────────────────────────────────────────────────────────────────────────────

export const PaymentStateAnnotation = Annotation.Root({
  // Core identification
  paymentId: Annotation<string>({
    reducer: (_, b) => b,
  }),

  // The original payment request
  request: Annotation<PaymentRequest>({
    reducer: (_, b) => b,
  }),

  // FX Router output
  fxQuote: Annotation<FXQuote | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),

  // Policy Agent output
  policyDecision: Annotation<PolicyDecision | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),

  // Execution Agent output
  executionResult: Annotation<ExecutionResult | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),

  // Reconciliation Agent output
  attestationResult: Annotation<AttestationResult | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),

  // Current workflow status
  status: Annotation<PaymentStatus>({
    reducer: (_, b) => b,
    default: () => "pending",
  }),

  // Accumulated reasoning trace — append only
  trace: Annotation<TraceEntry[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  // Error state
  error: Annotation<string | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),

  // Retry counter
  retryCount: Annotation<number>({
    reducer: (_, b) => b,
    default: () => 0,
  }),

  // LangGraph message history (for agent LLM calls)
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});

export type PaymentState = typeof PaymentStateAnnotation.State;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function makeTrace(
  agentId: string,
  step: string,
  summary: string,
  detail?: string,
  durationMs?: number
): TraceEntry {
  return {
    agentId,
    step,
    summary,
    detail,
    timestamp: new Date().toISOString(),
    durationMs,
  };
}

export function isQuoteStale(quote: FXQuote): boolean {
  const quotedAt = new Date(quote.quotedAt).getTime();
  const now = Date.now();
  return now - quotedAt > 30_000; // 30 second TTL
}
