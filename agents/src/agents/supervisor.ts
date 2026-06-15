import { v4 as uuidv4 } from "uuid";
import { PaymentState, PaymentRequest, makeTrace } from "../graph/state";
import { upsertAgentStatus } from "../tools/supabase";
import { callLLMJSON } from "../tools/llm";
import { getSymbol } from "../config/addresses";

const AGENT_ID = "supervisor";
const MAX_RETRIES = 3;

export async function supervisorAgent(state: PaymentState): Promise<Partial<PaymentState>> {
  const start = Date.now();

  await upsertAgentStatus(AGENT_ID, {
    status: "active",
    current_payment_id: state.paymentId ?? null,
    last_action: state.status === "pending" ? "init_payment" : "handle_retry",
    last_action_at: new Date().toISOString(),
  });

  // ── Initial dispatch ───────────────────────────────────────────────────────
  if (state.status === "pending") {
    const paymentId = state.paymentId || uuidv4();
    const fromSym = getSymbol(state.request.fromCurrency);
    const toSym = getSymbol(state.request.toCurrency);

    await upsertAgentStatus(AGENT_ID, {
      status: "active",
      current_payment_id: paymentId,
      last_action: "dispatching_to_fx_router",
      last_action_at: new Date().toISOString(),
    });

    return {
      paymentId,
      status: "fx_quoting",
      trace: [makeTrace(AGENT_ID, "init",
        `Payment ${paymentId.slice(0, 8)}... | ${formatWei(state.request.amount)} ${fromSym} → ${toSym} | ${state.request.memo || "no memo"}`,
        undefined, Date.now() - start)],
    };
  }

  // ── Settled ────────────────────────────────────────────────────────────────
  if (state.status === "settled") {
    await upsertAgentStatus(AGENT_ID, {
      status: "idle", current_payment_id: null,
      last_action: "payment_settled", last_action_at: new Date().toISOString(),
    });
    return {};
  }

  // ── Retry logic ────────────────────────────────────────────────────────────
  if (state.status === "retrying" || state.status === "failed") {
    const retryCount = (state.retryCount ?? 0) + 1;

    if (retryCount > MAX_RETRIES) {
      await upsertAgentStatus(AGENT_ID, {
        status: "idle", current_payment_id: null,
        last_action: `max_retries_exceeded`, last_action_at: new Date().toISOString(),
      });
      return {
        status: "failed",
        error: `Max retries (${MAX_RETRIES}) exceeded. Last error: ${state.error}`,
        retryCount,
        trace: [makeTrace(AGENT_ID, "max_retries",
          `Giving up after ${MAX_RETRIES} retries: ${state.error}`, undefined, Date.now() - start)],
      };
    }

    // Ask Groq to analyse the failure
    const recovery = await callLLMJSON<{
      summary: string; detail: string;
      increaseSlippage: boolean; shouldAbort: boolean;
    }>(
      `You are the Supervisor Agent for PayForge Orchestra, a Nigerian freelancer payment system on Celo.
A payment failed. Decide recovery strategy. Return ONLY valid JSON, no markdown.

Error: ${state.error}
Retry: ${retryCount}/${MAX_RETRIES}
Amount: ${formatWei(state.request.amount)} ${getSymbol(state.request.fromCurrency)} → ${getSymbol(state.request.toCurrency)}

{"summary":"one-line plan","detail":"reasoning","increaseSlippage":false,"shouldAbort":false}

Set shouldAbort=true only for: policy rejection, zero balance, invalid address.
Set increaseSlippage=true for: slippage / price impact errors.`,
      { summary: "Retrying with default parameters", detail: "", increaseSlippage: false, shouldAbort: false }
    );

    if (recovery.shouldAbort) {
      return {
        status: "failed",
        error: `Supervisor aborted: ${recovery.summary}`,
        retryCount,
        trace: [makeTrace(AGENT_ID, "aborted", `Aborted: ${recovery.summary}`, recovery.detail, Date.now() - start)],
      };
    }

    if (recovery.increaseSlippage && state.fxQuote) {
      process.env.FX_SLIPPAGE_OVERRIDE = String(Math.min(500, (state.fxQuote.slippageBps ?? 100) * 2));
    }

    return {
      retryCount,
      status: "fx_quoting",
      error: null,
      fxQuote: null,
      policyDecision: null,
      executionResult: null,
      trace: [makeTrace(AGENT_ID, "retry",
        `Retry ${retryCount}/${MAX_RETRIES} — ${recovery.summary}`,
        recovery.detail, Date.now() - start)],
    };
  }

  return {};
}

function formatWei(wei: string): string {
  try {
    const n = BigInt(wei);
    const d = BigInt(1e18);
    return `${n / d}.${(n % d).toString().padStart(18, "0").slice(0, 2)}`;
  } catch { return wei; }
}
