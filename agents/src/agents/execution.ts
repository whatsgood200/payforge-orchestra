import { keccak256, toHex, encodePacked, formatUnits, parseUnits } from "viem";
import { PaymentState, makeTrace, ExecutionResult } from "../graph/state";
import { getCeloClient } from "../tools/celo";

const AGENT_ID = "execution";
const MAX_GAS_USDm = parseUnits("0.01", 18); // Hard cap: never spend more than 0.01 USDm on gas

/**
 * Execution Agent
 *
 * Responsibilities:
 * - Build and sign the payment transaction using the ERC-8004 agent wallet
 * - Choose direct vs FX path based on fxQuote
 * - Set feeCurrency=USDm so gas is paid in stablecoin (Celo native fee currencies) (Celo feature)
 * - Wait for confirmation and return the receipt
 * - On revert, parse error and set status=failed for Supervisor retry logic
 */
export async function executionAgent(state: PaymentState): Promise<Partial<PaymentState>> {
  const start = Date.now();
  const { request, fxQuote, paymentId } = state;

  if (!fxQuote) {
    return {
      status: "failed",
      error: "Execution Agent: fxQuote is missing",
      trace: [makeTrace(AGENT_ID, "missing_quote", "Cannot execute — no FX quote in state")],
    };
  }

  const executionPrivateKey = process.env.EXECUTION_AGENT_PRIVATE_KEY as `0x${string}`;
  if (!executionPrivateKey) {
    return {
      status: "failed",
      error: "EXECUTION_AGENT_PRIVATE_KEY not set",
      trace: [makeTrace(AGENT_ID, "config_error", "Missing execution agent private key")],
    };
  }

  const celoClient = getCeloClient("execution", executionPrivateKey);

  // Derive a deterministic bytes32 paymentId from our UUID string
  const paymentIdBytes32 = keccak256(toHex(paymentId)) as `0x${string}`;

  // Derive agentId bytes32 from deployment artifact
  const agentId = getAgentIdBytes32("execution");

  // Compute state hash for attestation — keccak256 of the serialised state
  const stateHash = keccak256(toHex(JSON.stringify({ paymentId, request, fxQuote }))) as `0x${string}`;

  // ── Check business has approved orchestrator to spend tokenIn ─────────────
  const orchestratorAddr = getOrchestratorAddress();
  const currentAllowance = await celoClient.getAllowance(
    request.fromCurrency,
    request.business,
    orchestratorAddr
  );

  const amountIn = BigInt(request.amount);

  if (currentAllowance < amountIn) {
    // In a real production setup the business wallet would pre-approve.
    // For the hackathon demo, if the deployer IS the business wallet, approve here.
    if (process.env.BUSINESS_PRIVATE_KEY) {
      const businessClient = getCeloClient("business", process.env.BUSINESS_PRIVATE_KEY as `0x${string}`);
      const approveHash = await businessClient.approveToken(
        request.fromCurrency,
        orchestratorAddr,
        amountIn * 2n  // approve 2x for headroom
      );
      await businessClient.waitForReceipt(approveHash);
    } else {
      return {
        status: "failed",
        error: `Business wallet has insufficient allowance (${formatUnits(currentAllowance, 18)} < ${formatUnits(amountIn, 18)}) and BUSINESS_PRIVATE_KEY not set`,
        trace: [
          makeTrace(
            AGENT_ID,
            "allowance_error",
            `Insufficient token allowance — ${formatUnits(currentAllowance, 18)} approved, need ${formatUnits(amountIn, 18)}`
          ),
        ],
      };
    }
  }

  // ── Execute the payment ────────────────────────────────────────────────────
  let txHash: `0x${string}`;

  const isSameCurrency = request.fromCurrency.toLowerCase() === request.toCurrency.toLowerCase();

  try {
    if (isSameCurrency) {
      // Direct transfer — no Mento swap needed
      txHash = await celoClient.executeDirectPayment({
        paymentId: paymentIdBytes32,
        business: request.business,
        recipient: request.recipient,
        amount: amountIn,
        token: request.fromCurrency,
        agentId,
        stateHash,
      });
    } else {
      // FX swap via Mento
      txHash = await celoClient.executeFXPayment({
        paymentId: paymentIdBytes32,
        business: request.business,
        recipient: request.recipient,
        amountIn,
        tokenIn: request.fromCurrency,
        tokenOut: request.toCurrency,
        exchangeProvider: fxQuote.exchangeProvider,
        exchangeId: fxQuote.exchangeId as `0x${string}`,
        minAmountOut: BigInt(fxQuote.minAmountOut),
        agentId,
        stateHash,
      });
    }
  } catch (err: any) {
    const errMsg = parseContractError(err);
    return {
      status: "failed",
      error: errMsg,
      trace: [
        makeTrace(
          AGENT_ID,
          "tx_reverted",
          `Transaction failed: ${errMsg}`,
          err.message,
          Date.now() - start
        ),
      ],
    };
  }

  // ── Wait for confirmation ──────────────────────────────────────────────────
  let receipt;
  try {
    receipt = await celoClient.waitForReceipt(txHash, 90_000);
  } catch (err: any) {
    return {
      status: "failed",
      error: `Transaction confirmation timeout: ${txHash}`,
      trace: [
        makeTrace(
          AGENT_ID,
          "confirmation_timeout",
          `Tx submitted (${txHash}) but confirmation timed out`,
          err.message,
          Date.now() - start
        ),
      ],
    };
  }

  if (receipt.status === "reverted") {
    return {
      status: "failed",
      error: `Transaction reverted on-chain: ${txHash}`,
      trace: [
        makeTrace(
          AGENT_ID,
          "tx_reverted_onchain",
          `Tx reverted in block ${receipt.blockNumber}: ${txHash}`,
          undefined,
          Date.now() - start
        ),
      ],
    };
  }

  // ── Build result ───────────────────────────────────────────────────────────
  const gasCostCUSD = formatUnits(
    (receipt.gasUsed * (receipt.effectiveGasPrice ?? 0n)) / 1000n,
    18
  );

  const result: ExecutionResult = {
    txHash,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: receipt.gasUsed.toString(),
    feeCurrency: request.fromCurrency, // USDm used as feeCurrency (Celo native fee currency)
    gasCostCUSD,
    confirmedAt: new Date().toISOString(),
  };

  const summary = isSameCurrency
    ? `Sent ${formatUnits(amountIn, 18)} directly | Tx: ${txHash.slice(0, 18)}... | Block: ${receipt.blockNumber}`
    : `Swapped ${formatUnits(amountIn, 18)} → ${fxQuote.amountOutFormatted} via Mento | Tx: ${txHash.slice(0, 18)}... | Block: ${receipt.blockNumber}`;

  return {
    executionResult: result,
    status: "awaiting_confirmation",
    trace: [makeTrace(AGENT_ID, "tx_confirmed", summary, celoClient.txUrl(txHash), Date.now() - start)],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getAgentIdBytes32(agentKey: string): `0x${string}` {
  try {
    const chainId = parseInt(process.env.CHAIN_ID ?? "11142220");
    const artifactName = chainId === 42220 ? "celo" : "celo-sepolia";
    const deployment = require(`../../contracts/deployments/${artifactName}.json`);
    const agentId = deployment.agents[agentKey]?.erc8004AgentId;
    if (agentId) {
      return `0x${agentId.toString(16).padStart(64, "0")}`;
    }
  } catch {}
  // Fallback: deterministic from agentKey
  return keccak256(toHex(agentKey));
}

function getOrchestratorAddress(): `0x${string}` {
  try {
    const chainId = parseInt(process.env.CHAIN_ID ?? "11142220");
    const artifactName = chainId === 42220 ? "celo" : "celo-sepolia";
    const deployment = require(`../../contracts/deployments/${artifactName}.json`);
    return deployment.contracts.paymentOrchestrator as `0x${string}`;
  } catch {
    throw new Error("PaymentOrchestrator address not found — run deploy.ts first");
  }
}

function parseContractError(err: any): string {
  const msg: string = err?.message ?? String(err);

  // Viem contract revert messages
  if (msg.includes("PolicyEngine:")) return msg.match(/PolicyEngine:[^"]+/)?.[0] ?? msg;
  if (msg.includes("PaymentOrchestrator:")) return msg.match(/PaymentOrchestrator:[^"]+/)?.[0] ?? msg;
  if (msg.includes("ERC20:")) return "Token transfer failed — check balance and allowance";
  if (msg.includes("insufficient")) return "Insufficient balance or allowance";
  if (msg.includes("duplicate paymentId")) return "Duplicate payment ID — this payment was already processed";

  return msg.length > 200 ? msg.slice(0, 200) + "..." : msg;
}
