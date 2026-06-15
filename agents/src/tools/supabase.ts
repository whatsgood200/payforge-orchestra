import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Database schema types — mirrors the Supabase tables
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentRow {
  payment_id: string;
  payment_id_bytes32: string;
  business: string;
  recipient: string;
  amount_in: string;
  token_in: string;
  amount_out: string;
  token_out: string;
  fx_rate: string;
  tx_hash: string;
  block_number: number;
  gas_used: string;
  gas_cost_cusd: string;
  attestation_id: number | null;
  status: "pending" | "executing" | "settled" | "failed";
  memo: string;
  settled_at: string | null;
  chain_id: number;
  explorer_url: string;
  trace: string; // JSON string
  created_at?: string;
}

export interface AgentStatusRow {
  agent_id: string; // "supervisor" | "fx-router" | "policy" | "execution" | "reconciliation"
  erc8004_agent_id: number | null;
  wallet_address: string;
  status: "idle" | "active" | "executing" | "error";
  current_payment_id: string | null;
  last_action: string;
  last_action_at: string;
  tx_count: number;
  updated_at: string;
}

export interface TraceRow {
  id?: number;
  payment_id: string;
  agent_id: string;
  step: string;
  summary: string;
  detail: string | null;
  duration_ms: number | null;
  timestamp: string;
  created_at?: string;
}

export interface Database {
  public: {
    Tables: {
      payments: {
        Row: PaymentRow;
        Insert: PaymentRow;
        Update: Partial<PaymentRow>;
      };
      agent_status: {
        Row: AgentStatusRow;
        Insert: AgentStatusRow;
        Update: Partial<AgentStatusRow>;
      };
      trace_logs: {
        Row: TraceRow;
        Insert: TraceRow;
        Update: Partial<TraceRow>;
      };
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton client
// ─────────────────────────────────────────────────────────────────────────────

let _supabase: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error(
        "Supabase credentials not set. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env"
      );
    }

    _supabase = createClient<Database>(url, key, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return _supabase;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers used across agents
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertAgentStatus(
  agentId: string,
  update: Partial<AgentStatusRow>
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.from("agent_status").upsert(
      { agent_id: agentId, updated_at: new Date().toISOString(), ...update } as any,
      { onConflict: "agent_id" }
    );
  } catch {
    // Non-critical — don't crash agents over dashboard updates
  }
}

export async function insertTraceLog(row: TraceRow): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.from("trace_logs").insert(row as any);
  } catch {
    // Non-critical
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase SQL migration — run once to set up tables
// Paste into Supabase SQL editor or use supabase CLI migrations
// ─────────────────────────────────────────────────────────────────────────────

export const SUPABASE_MIGRATION_SQL = `
-- Payments table
create table if not exists payments (
  payment_id text primary key,
  payment_id_bytes32 text not null,
  business text not null,
  recipient text not null,
  amount_in text not null,
  token_in text not null,
  amount_out text not null,
  token_out text not null,
  fx_rate text not null default '1',
  tx_hash text,
  block_number integer,
  gas_used text,
  gas_cost_cusd text,
  attestation_id integer,
  status text not null default 'pending',
  memo text default '',
  settled_at timestamptz,
  chain_id integer not null default 11142220,
  explorer_url text,
  trace text default '[]',
  created_at timestamptz default now()
);

-- Real-time replication
alter table payments replica identity full;

-- Agent status table
create table if not exists agent_status (
  agent_id text primary key,
  erc8004_agent_id integer,
  wallet_address text not null default '',
  status text not null default 'idle',
  current_payment_id text,
  last_action text default '',
  last_action_at timestamptz default now(),
  tx_count integer default 0,
  updated_at timestamptz default now()
);

alter table agent_status replica identity full;

-- Trace logs
create table if not exists trace_logs (
  id bigserial primary key,
  payment_id text not null,
  agent_id text not null,
  step text not null,
  summary text not null,
  detail text,
  duration_ms integer,
  timestamp timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists trace_logs_payment_id on trace_logs(payment_id);
alter table trace_logs replica identity full;

-- Enable realtime for all three tables
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table payments, agent_status, trace_logs;
commit;
`;
