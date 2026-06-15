import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { z } from "zod";
import { isAddress } from "viem";
import { executePayment } from "./graph/workflow";
import { PaymentRequest } from "./graph/state";
import { getSupabaseClient } from "./tools/supabase";
import { getCeloClient } from "./tools/celo";
import { getAddresses, CHAIN_IDS } from "./config/addresses";

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────────────────

// In-memory schedule store (persists while server is running)
const scheduledJobs = new Map<string, {
  recipientAddress: string;
  amountUSDm: number;
  memo: string;
  intervalMs: number;
  nextRun: number;
  createdAt: string;
  runCount: number;
}>();

// Scheduler tick — runs every minute, executes due jobs
setInterval(async () => {
  const now = Date.now();
  for (const [jobId, job] of scheduledJobs.entries()) {
    if (now >= job.nextRun) {
      job.runCount++;
      job.nextRun = now + job.intervalMs;
      console.log(`[SCHEDULER] Running job ${jobId} — run #${job.runCount}`);
      try {
        const { executePayment } = await import("./graph/workflow");
        const chainId = parseInt(process.env.CHAIN_ID ?? "11142220");
        const isSepolia = chainId !== 42220;
        const USDm = isSepolia ? "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b" : "0x765DE816845861e75A25fCA122bb6898B8B1282a";
        const NGNm = isSepolia ? "0x3d5ae86F34E2a82771496D140daFAEf3789dF888" : "0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71";
        const CELO = "0x471EcE3750Da237f93B8E339c536989b8978a438";
        await executePayment({
          amount: BigInt(Math.round(job.amountUSDm * 1e18)).toString(),
          fromCurrency: USDm as `0x${string}`,
          toCurrency: (isSepolia ? CELO : NGNm) as `0x${string}`,
          recipient: job.recipientAddress as `0x${string}`,
          business: (process.env.BUSINESS_ADDRESS ?? "") as `0x${string}`,
          memo: `[SCHEDULED] ${job.memo} — run #${job.runCount}`,
          requestedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error(`[SCHEDULER] Job ${jobId} failed:`, err.message);
      }
    }
  }
}, 60_000);

const PaymentRequestSchema = z.object({
  amount: z.string().regex(/^\d+$/, "amount must be a wei string (integer)"),
  fromCurrency: z.string().refine(isAddress, "fromCurrency must be a valid address"),
  toCurrency: z.string().refine(isAddress, "toCurrency must be a valid address"),
  recipient: z.string().refine(isAddress, "recipient must be a valid address"),
  business: z.string().refine(isAddress, "business must be a valid address"),
  memo: z.string().max(256).default(""),
});

// ─────────────────────────────────────────────────────────────────────────────
// App setup
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/payment
 * Execute a payment through the multi-agent system.
 */
app.post("/api/payment", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = PaymentRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const request: PaymentRequest = {
      ...parsed.data,
      fromCurrency: parsed.data.fromCurrency as `0x${string}`,
      toCurrency: parsed.data.toCurrency as `0x${string}`,
      recipient: parsed.data.recipient as `0x${string}`,
      business: parsed.data.business as `0x${string}`,
      requestedAt: new Date().toISOString(),
    };

    const acceptSSE = req.headers.accept?.includes("text/event-stream");

    if (acceptSSE) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ type: "ack", message: "Payment workflow started" })}\n\n`);
      const finalState = await executePayment(request);
      res.write(
        `data: ${JSON.stringify({
          type: "complete",
          status: finalState.status,
          paymentId: finalState.paymentId,
          txHash: finalState.executionResult?.txHash,
          attestationId: finalState.attestationResult?.attestationId,
          trace: finalState.trace,
          error: finalState.error,
        })}\n\n`
      );
      res.end();
    } else {
      const finalState = await executePayment(request);
      return res.status(finalState.status === "settled" ? 200 : 422).json({
        paymentId: finalState.paymentId,
        status: finalState.status,
        txHash: finalState.executionResult?.txHash ?? null,
        blockNumber: finalState.executionResult?.blockNumber ?? null,
        amountOut: finalState.fxQuote?.amountOut ?? null,
        amountOutFormatted: finalState.fxQuote?.amountOutFormatted ?? null,
        attestationId: finalState.attestationResult?.attestationId ?? null,
        attestationUrl: finalState.attestationResult?.onchainUrl ?? null,
        fxRate: finalState.fxQuote?.rate ?? null,
        trace: finalState.trace,
        error: finalState.error ?? null,
        policyDecision: finalState.policyDecision
          ? {
              approved: finalState.policyDecision.approved,
              riskScore: finalState.policyDecision.riskScore,
              utilizationPct: finalState.policyDecision.utilizationPct,
            }
          : null,
      });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/payment/:paymentId
 */
app.get("/api/payment/:paymentId", async (req: Request, res: Response) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("payment_id", req.params.paymentId)
    .single();
  if (error || !data) return res.status(404).json({ error: "Payment not found" });
  return res.json(data);
});

/**
 * GET /api/payments
 */
app.get("/api/payments", async (req: Request, res: Response) => {
  const supabase = getSupabaseClient();
  const limit = Math.min(parseInt((req.query.limit as string) ?? "20"), 100);
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data ?? []);
});

/**
 * GET /api/agents
 */
app.get("/api/agents", async (req: Request, res: Response) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("agent_status").select("*");
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data ?? []);
});

/**
 * GET /api/trace/:paymentId
 */
app.get("/api/trace/:paymentId", async (req: Request, res: Response) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("trace_logs")
    .select("*")
    .eq("payment_id", req.params.paymentId)
    .order("timestamp", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data ?? []);
});

/**
 * GET /api/stats
 */
app.get("/api/stats", async (req: Request, res: Response) => {
  const chainId = parseInt(process.env.CHAIN_ID ?? "11142220");
  const celoClient = getCeloClient("stats");
  const [chainStats, supabaseStats] = await Promise.allSettled([
    celoClient.getStats(),
    getSupabaseClient()
      .from("payments")
      .select("payment_id, amount_in", { count: "exact", head: false })
      .eq("status", "settled"),
  ]);
  const onchainTotal = chainStats.status === "fulfilled" ? chainStats.value.totalPayments : 0n;
  const onchainVolume = chainStats.status === "fulfilled" ? chainStats.value.totalVolumeUSD : 0n;
  const offchainCount = supabaseStats.status === "fulfilled" ? supabaseStats.value.count ?? 0 : 0;
  return res.json({
    totalPaymentsOnchain: onchainTotal.toString(),
    totalVolumeUSDOnchain: onchainVolume.toString(),
    totalPaymentsOffchain: offchainCount,
    chainId,
    network: chainId === CHAIN_IDS.CELO ? "celo" : "celoSepolia",
    addresses: getAddresses(chainId),
  });
});

/**
 * GET /api/agents/:agentKey/registration
 */
app.get("/api/agents/:agentKey/registration", (req: Request, res: Response) => {
  const agentKey = req.params.agentKey;
  const validKeys = ["supervisor", "fxRouter", "policy", "execution", "reconciliation"];
  if (!validKeys.includes(agentKey)) return res.status(404).json({ error: "Agent not found" });
  try {
    const regFile = require(`../../contracts/agent-registrations/${agentKey}.json`);
    return res.json(regFile);
  } catch {
    return res.status(404).json({ error: "Registration file not found — run deploy.ts first" });
  }
});

// ─── Natural language task endpoint ──────────────────────────────────────────
app.post("/api/task", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { instruction } = req.body;
    if (!instruction || typeof instruction !== "string") {
      return res.status(400).json({ error: "instruction is required" });
    }

    const { callLLMJSON } = await import("./tools/llm");
    const chainId = parseInt(process.env.CHAIN_ID ?? "11142220");
    const isSepolia = chainId !== 42220;

    const USDm = isSepolia
      ? "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b"
      : "0x765DE816845861e75A25fCA122bb6898B8B1282a";
    const NGNm = isSepolia
      ? "0x3d5ae86F34E2a82771496D140daFAEf3789dF888"
      : "0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71";
    const CELO = "0x471EcE3750Da237f93B8E339c536989b8978a438";

    const parsed = await callLLMJSON<{
      amount_usdm: number;
      recipient: string;
      memo: string;
      toCurrency: string;
    }>(
      `You are parsing a payment instruction for PayForge Orchestra, a Nigerian freelancer payment system on Celo.

Extract payment details from this instruction: "${instruction}"

Rules:
- amount_usdm: number in USDm (e.g. "Pay 5 USDm" → 5, "send $10" → 10)
- recipient: ethereum address starting with 0x (extract exactly as written)
- memo: the purpose/description (e.g. "invoice #123", "monthly payroll")
- toCurrency: always return "NGNm" unless instruction says CELO or another currency

Return ONLY valid JSON, no markdown:
{"amount_usdm": 5, "recipient": "0x...", "memo": "invoice #123", "toCurrency": "NGNm"}`,
      { amount_usdm: 1, recipient: "", memo: instruction, toCurrency: "NGNm" }
    );

    if (!parsed.recipient || !parsed.recipient.startsWith("0x")) {
      return res.status(400).json({
        error: "Could not extract a recipient address from instruction. Please include a wallet address like 0x1234...",
        instruction,
      });
    }

    const toCurrencyAddr = isSepolia ? CELO : (parsed.toCurrency === "CELO" ? CELO : NGNm);
    const amountWei = BigInt(Math.round(parsed.amount_usdm * 1e18)).toString();

    const { executePayment } = await import("./graph/workflow");
    const businessAddr = (process.env.BUSINESS_ADDRESS ?? "") as `0x${string}`;

    const finalState = await executePayment({
      amount: amountWei,
      fromCurrency: USDm as `0x${string}`,
      toCurrency: toCurrencyAddr as `0x${string}`,
      recipient: parsed.recipient as `0x${string}`,
      business: businessAddr,
      memo: parsed.memo,
      requestedAt: new Date().toISOString(),
    });

    return res.status(finalState.status === "settled" ? 200 : 422).json({
      instruction,
      parsed: { amount_usdm: parsed.amount_usdm, recipient: parsed.recipient, memo: parsed.memo },
      paymentId: finalState.paymentId,
      status: finalState.status,
      txHash: finalState.executionResult?.txHash ?? null,
      fxRate: finalState.fxQuote?.rate ?? null,
      trace: finalState.trace,
      error: finalState.error ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Scheduled / recurring payment ───────────────────────────────────────────
app.post("/api/schedule", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { instruction, recipientAddress, amountUSDm, intervalHours, memo } = req.body;

    const jobId = require("uuid").v4();
    const intervalMs = (intervalHours ?? 24) * 60 * 60 * 1000;

    scheduledJobs.set(jobId, {
      recipientAddress,
      amountUSDm,
      memo: memo ?? instruction ?? "Scheduled remittance",
      intervalMs,
      nextRun: Date.now() + intervalMs,
      createdAt: new Date().toISOString(),
      runCount: 0,
    });

    const { executePayment } = await import("./graph/workflow");
    const chainId = parseInt(process.env.CHAIN_ID ?? "11142220");
    const isSepolia = chainId !== 42220;
    const USDm = isSepolia ? "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b" : "0x765DE816845861e75A25fCA122bb6898B8B1282a";
    const NGNm = isSepolia ? "0x3d5ae86F34E2a82771496D140daFAEf3789dF888" : "0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71";
    const CELO = "0x471EcE3750Da237f93B8E339c536989b8978a438";
    const business = (process.env.BUSINESS_ADDRESS ?? "") as `0x${string}`;

    const firstPayment = await executePayment({
      amount: BigInt(Math.round(amountUSDm * 1e18)).toString(),
      fromCurrency: USDm as `0x${string}`,
      toCurrency: (isSepolia ? CELO : NGNm) as `0x${string}`,
      recipient: recipientAddress as `0x${string}`,
      business,
      memo: `[SCHEDULED] ${memo ?? "Recurring remittance"} — run #1`,
      requestedAt: new Date().toISOString(),
    });

    return res.json({
      jobId,
      status: "scheduled",
      firstPayment: { status: firstPayment.status, txHash: firstPayment.executionResult?.txHash },
      nextRun: new Date(Date.now() + intervalMs).toISOString(),
      intervalHours,
      message: `Recurring payment of ${amountUSDm} USDm → NGNm scheduled every ${intervalHours}h`,
    });
  } catch (err) { next(err); }
});

app.get("/api/schedule", (_req, res) => {
  const jobs = Array.from(scheduledJobs.entries()).map(([id, job]) => ({
    id, ...job, nextRunFormatted: new Date(job.nextRun).toISOString(),
  }));
  res.json(jobs);
});

// ─── Cancel a scheduled job ───────────────────────────────────────────────────
app.delete("/api/schedule/:jobId", (req: Request, res: Response) => {
  const { jobId } = req.params;
  if (scheduledJobs.has(jobId)) {
    scheduledJobs.delete(jobId);
    res.json({ success: true, message: `Job ${jobId} cancelled` });
  } else {
    res.status(404).json({ error: "Job not found" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Policy router
// ─────────────────────────────────────────────────────────────────────────────

import policyRouter from "./api/policy";
app.use("/api/policy", policyRouter);

// ─────────────────────────────────────────────────────────────────────────────
// Global error handler
// ─────────────────────────────────────────────────────────────────────────────

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("[PayForge API Error]", err);
  res.status(500).json({
    error: err.message ?? "Internal server error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3001");
app.listen(PORT, () => {
  console.log(`\n🤖 PayForge Orchestra agent service running on port ${PORT}`);
  console.log(`   Network: ${process.env.CHAIN_ID === "42220" ? "Celo Mainnet" : "Alfajores Testnet"}`);
  console.log(`   POST /api/payment       — execute a payment`);
  console.log(`   GET  /api/payments      — list recent payments`);
  console.log(`   GET  /api/agents        — live agent status`);
  console.log(`   GET  /api/stats         — aggregate stats\n`);
});

export default app;

// Import and mount policy router (appended at runtime)
