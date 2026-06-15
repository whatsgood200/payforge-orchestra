import { formatUnits } from "viem";
import { PaymentState, makeTrace, PolicyDecision } from "../graph/state";
import { getCeloClient } from "../tools/celo";
import { callLLMJSON } from "../tools/llm";
import { getSymbol } from "../config/addresses";

const AGENT_ID = "policy";

export async function policyAgent(state: PaymentState): Promise<Partial<PaymentState>> {
  const start = Date.now();
  const { request } = state;

  const celoClient = getCeloClient("policy", process.env.EXECUTION_AGENT_PRIVATE_KEY as `0x${string}` | undefined);

  // ── 1. Onchain simulation (read-only) ──────────────────────────────────────
  let onchainApproved = false;
  let onchainReason = "Unknown error";
  let remainingDailyAllowance = 0n;

  try {
    const [approved, reason, remaining] = await celoClient.simulatePolicyCheck(
      request.business, request.recipient, BigInt(request.amount)
    );
    onchainApproved = approved;
    onchainReason = reason;
    remainingDailyAllowance = remaining;
  } catch (err: any) {
    return {
      status: "policy_rejected",
      policyDecision: {
        approved: false,
        reason: `PolicyEngine unreachable: ${err.message}`,
        dailyLimitUsed: "0", dailyLimitTotal: "0",
        utilizationPct: 0, riskScore: 100,
        riskNotes: "Cannot verify policy — blocking for safety",
        checkedAt: new Date().toISOString(),
      },
      trace: [makeTrace(AGENT_ID, "onchain_error", `PolicyEngine call failed — ${err.message}`, err.stack, Date.now() - start)],
    };
  }

  if (!onchainApproved) {
    return {
      status: "policy_rejected",
      policyDecision: {
        approved: false, reason: onchainReason,
        dailyLimitUsed: "0", dailyLimitTotal: "0",
        utilizationPct: 0, riskScore: 90,
        riskNotes: `Onchain rejection: ${onchainReason}`,
        checkedAt: new Date().toISOString(),
      },
      trace: [makeTrace(AGENT_ID, "onchain_rejected", `Onchain policy rejected: ${onchainReason}`, undefined, Date.now() - start)],
    };
  }

  // ── 2. Fetch policy details ────────────────────────────────────────────────
  let policyDetails = { dailyLimit: 0n, maxSingleTx: 0n, minSingleTx: 0n, dailySpent: 0n };
  try {
    const [dailyLimit, maxSingleTx, minSingleTx, dailySpent] = await celoClient.getPolicy(request.business);
    policyDetails = { dailyLimit, maxSingleTx, minSingleTx, dailySpent };
  } catch { /* non-critical */ }

  const utilizationPct = policyDetails.dailyLimit > 0n
    ? Number(((policyDetails.dailySpent + BigInt(request.amount)) * 100n) / policyDetails.dailyLimit)
    : 0;

  const amountFormatted = formatUnits(BigInt(request.amount), 18);

  // ── 3. LLM risk assessment (Groq, free) ───────────────────────────────────
  const { riskScore, riskNotes } = await callLLMJSON<{ riskScore: number; riskNotes: string }>(
    `You are the Policy Agent for PayForge Orchestra, a Nigerian freelancer payment system on Celo.
Assess payment risk. Return ONLY valid JSON, no markdown:

Payment:
- Amount: ${amountFormatted} ${getSymbol(request.fromCurrency)}
- To currency: ${getSymbol(request.toCurrency)}
- Recipient: ${request.recipient}
- Memo: "${request.memo}"
- Daily utilization after tx: ${utilizationPct}%
- Max single tx: ${formatUnits(policyDetails.maxSingleTx, 18)} USDm
- Daily limit: ${formatUnits(policyDetails.dailyLimit, 18)} USDm

{"riskScore": 0-100, "riskNotes": "one sentence explanation"}`,
    { riskScore: 10, riskNotes: "Low risk — standard freelancer payment" }
  );

  // ── 4. Final decision ──────────────────────────────────────────────────────
  const finalApproved = onchainApproved && riskScore < 80;
  const finalReason = finalApproved ? "Approved"
    : riskScore >= 80 ? `High risk (${riskScore}/100): ${riskNotes}`
    : onchainReason;

  const decision: PolicyDecision = {
    approved: finalApproved,
    reason: finalReason,
    dailyLimitUsed: (policyDetails.dailySpent + BigInt(request.amount)).toString(),
    dailyLimitTotal: policyDetails.dailyLimit.toString(),
    utilizationPct,
    riskScore: Math.max(0, Math.min(100, riskScore)),
    riskNotes,
    checkedAt: new Date().toISOString(),
  };

  return {
    policyDecision: decision,
    status: finalApproved ? "policy_approved" : "policy_rejected",
    trace: [makeTrace(AGENT_ID,
      finalApproved ? "approved" : "rejected",
      finalApproved
        ? `Approved | Risk: ${riskScore}/100 | Daily utilization: ${utilizationPct}%`
        : `Rejected: ${finalReason}`,
      riskNotes, Date.now() - start)],
  };
}
