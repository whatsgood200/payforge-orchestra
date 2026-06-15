import { StateGraph, END } from "@langchain/langgraph";
import { PaymentStateAnnotation, PaymentState, PaymentRequest } from "./state";
import { supervisorAgent } from "../agents/supervisor";
import { fxRouterAgent } from "../agents/fx-router";
import { policyAgent } from "../agents/policy";
import { executionAgent } from "../agents/execution";
import { reconciliationAgent } from "../agents/reconciliation";
import { upsertAgentStatus, insertTraceLog } from "../tools/supabase";
import { v4 as uuidv4 } from "uuid";

// ─────────────────────────────────────────────────────────────────────────────
// Node wrappers — update agent_status before/after each node
// ─────────────────────────────────────────────────────────────────────────────

async function withStatusTracking(
  agentId: string,
  fn: (state: PaymentState) => Promise<Partial<PaymentState>>,
  state: PaymentState
): Promise<Partial<PaymentState>> {
  const start = Date.now();

  await upsertAgentStatus(agentId, {
    status: "executing",
    current_payment_id: state.paymentId,
    last_action: `running_${agentId}`,
    last_action_at: new Date().toISOString(),
  });

  try {
    const result = await fn(state);

    // Persist any new trace entries to Supabase
    const newEntries = result.trace ?? [];
    for (const entry of newEntries) {
      await insertTraceLog({
        payment_id: state.paymentId ?? "unknown",
        agent_id: entry.agentId,
        step: entry.step,
        summary: entry.summary,
        detail: entry.detail ?? null,
        duration_ms: entry.durationMs ?? Date.now() - start,
        timestamp: entry.timestamp,
      });
    }

    await upsertAgentStatus(agentId, {
      status: "idle",
      current_payment_id: null,
      last_action: `completed_${agentId}`,
      last_action_at: new Date().toISOString(),
    });

    return result;
  } catch (err: any) {
    await upsertAgentStatus(agentId, {
      status: "error",
      last_action: `error_in_${agentId}: ${err.message?.slice(0, 100)}`,
      last_action_at: new Date().toISOString(),
    });
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Routing functions — determine next node from current state
// ─────────────────────────────────────────────────────────────────────────────

function routeFromSupervisor(state: PaymentState): string {
  switch (state.status) {
    case "fx_quoting":
      return "fx_router";
    case "failed":
      return END;
    default:
      return END;
  }
}

function routeFromFXRouter(state: PaymentState): string {
  switch (state.status) {
    case "fx_quoted":
      return "policy";
    case "failed":
      return "supervisor"; // Supervisor decides whether to retry
    default:
      return END;
  }
}

function routeFromPolicy(state: PaymentState): string {
  switch (state.status) {
    case "policy_approved":
      return "execution";
    case "policy_rejected":
      return END; // Hard stop — don't retry policy rejections
    case "failed":
      return END;
    default:
      return END;
  }
}

function routeFromExecution(state: PaymentState): string {
  switch (state.status) {
    case "awaiting_confirmation":
      return "reconciliation";
    case "failed":
      if ((state.retryCount ?? 0) < 3) {
        return "supervisor"; // Ask supervisor to analyse and decide
      }
      return END;
    default:
      return END;
  }
}

function routeFromReconciliation(state: PaymentState): string {
  switch (state.status) {
    case "settled":
      return END;
    case "failed":
      return END;
    default:
      return END;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the graph
// ─────────────────────────────────────────────────────────────────────────────

export function buildPaymentWorkflow() {
  const graph = new StateGraph(PaymentStateAnnotation)
    // ── Nodes ────────────────────────────────────────────────────────────────
    .addNode("supervisor", (state) =>
      withStatusTracking("supervisor", supervisorAgent, state)
    )
    .addNode("fx_router", (state) =>
      withStatusTracking("fx-router", fxRouterAgent, state)
    )
    .addNode("policy", (state) =>
      withStatusTracking("policy", policyAgent, state)
    )
    .addNode("execution", (state) =>
      withStatusTracking("execution", executionAgent, state)
    )
    .addNode("reconciliation", (state) =>
      withStatusTracking("reconciliation", reconciliationAgent, state)
    )
    // ── Entry point ──────────────────────────────────────────────────────────
    .addEdge("__start__", "supervisor")
    // ── Conditional edges ────────────────────────────────────────────────────
    .addConditionalEdges("supervisor", routeFromSupervisor, {
      fx_router: "fx_router",
      [END]: END,
    })
    .addConditionalEdges("fx_router", routeFromFXRouter, {
      policy: "policy",
      supervisor: "supervisor",
      [END]: END,
    })
    .addConditionalEdges("policy", routeFromPolicy, {
      execution: "execution",
      [END]: END,
    })
    .addConditionalEdges("execution", routeFromExecution, {
      reconciliation: "reconciliation",
      supervisor: "supervisor",
      [END]: END,
    })
    .addConditionalEdges("reconciliation", routeFromReconciliation, {
      [END]: END,
    });

  return graph.compile();
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — run a payment workflow end-to-end
// ─────────────────────────────────────────────────────────────────────────────

const _workflow = buildPaymentWorkflow();

export async function executePayment(request: PaymentRequest): Promise<PaymentState> {
  const paymentId = uuidv4();

  const initialState: Partial<PaymentState> = {
    paymentId,
    request,
    status: "pending",
    fxQuote: null,
    policyDecision: null,
    executionResult: null,
    attestationResult: null,
    trace: [],
    error: null,
    retryCount: 0,
    messages: [],
  };

  const finalState = await _workflow.invoke(initialState);
  return finalState as PaymentState;
}

export type PaymentWorkflow = ReturnType<typeof buildPaymentWorkflow>;
