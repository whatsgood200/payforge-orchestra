import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: { params: { eventsPerSecond: 10 } },
});

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Payment {
  payment_id: string;
  business: string;
  recipient: string;
  amount_in: string;
  token_in: string;
  amount_out: string;
  token_out: string;
  fx_rate: string;
  tx_hash: string | null;
  block_number: number | null;
  attestation_id: number | null;
  status: "pending" | "executing" | "settled" | "failed";
  memo: string;
  settled_at: string | null;
  explorer_url: string | null;
  chain_id: number;
  created_at: string;
}

export interface AgentStatus {
  agent_id: string;
  erc8004_agent_id: number | null;
  wallet_address: string;
  status: "idle" | "active" | "executing" | "error";
  current_payment_id: string | null;
  last_action: string;
  last_action_at: string;
  tx_count: number;
}

export interface TraceLog {
  id: number;
  payment_id: string;
  agent_id: string;
  step: string;
  summary: string;
  detail: string | null;
  duration_ms: number | null;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data fetchers
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchRecentPayments(limit = 20): Promise<Payment[]> {
  const { data } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as Payment[]) ?? [];
}

export async function fetchAgentStatuses(): Promise<AgentStatus[]> {
  const { data } = await supabase.from("agent_status").select("*");
  return (data as AgentStatus[]) ?? [];
}

export async function fetchTraceLogs(paymentId: string): Promise<TraceLog[]> {
  const { data } = await supabase
    .from("trace_logs")
    .select("*")
    .eq("payment_id", paymentId)
    .order("timestamp", { ascending: true });
  return (data as TraceLog[]) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Real-time subscriptions
// ─────────────────────────────────────────────────────────────────────────────

export function subscribeToPayments(callback: (payment: Payment) => void) {
  return supabase
    .channel("payments-channel")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payments" },
      (payload) => callback(payload.new as Payment)
    )
    .subscribe();
}

export function subscribeToAgentStatus(callback: (agent: AgentStatus) => void) {
  return supabase
    .channel("agent-status-channel")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "agent_status" },
      (payload) => callback(payload.new as AgentStatus)
    )
    .subscribe();
}

export function subscribeToTraceLogs(
  paymentId: string,
  callback: (log: TraceLog) => void
) {
  return supabase
    .channel(`trace-${paymentId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "trace_logs",
        filter: `payment_id=eq.${paymentId}`,
      },
      (payload) => callback(payload.new as TraceLog)
    )
    .subscribe();
}
