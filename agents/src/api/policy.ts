import { Router, Request, Response } from "express";
import { isAddress } from "viem";
import { z } from "zod";
import { getCeloClient, POLICY_ENGINE_ABI } from "../tools/celo";

const router = Router();

const PolicyConfigSchema = z.object({
  business: z.string().refine(isAddress, "Invalid business address"),
  dailyLimit: z.string().regex(/^\d+$/, "Must be wei string"),
  maxSingleTx: z.string().regex(/^\d+$/, "Must be wei string"),
  minSingleTx: z.string().regex(/^\d+$/, "Must be wei string").default("0"),
  requiresApprovedRecipients: z.boolean().default(false),
  approvedRecipients: z.array(z.string().refine(isAddress)).default([]),
});

/**
 * POST /api/policy
 * Configure a business policy onchain via PolicyEngine.sol.
 * Called by the config page when a business owner sets their limits.
 */
router.post("/", async (req: Request, res: Response) => {
  const parsed = PolicyConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { business, dailyLimit, maxSingleTx, minSingleTx, requiresApprovedRecipients, approvedRecipients } =
    parsed.data;

  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  if (!deployerKey) {
    return res.status(500).json({ error: "DEPLOYER_PRIVATE_KEY not set" });
  }

  try {
    const celoClient = getCeloClient("deployer", deployerKey);
    const chainId = parseInt(process.env.CHAIN_ID ?? "11142220");
const artifactName = chainId === 42220 ? "celo" : "celo-sepolia";
const deployment = require(`../../contracts/deployments/${artifactName}.json`);
    const policyEngineAddr = deployment.contracts.policyEngine as `0x${string}`;

    // Write configurePolicy to chain
    const hash = await (celoClient as any).walletClient.writeContract({
      address: policyEngineAddr,
      abi: POLICY_ENGINE_ABI,
      functionName: "configurePolicy",
      args: [
        business as `0x${string}`,
        BigInt(dailyLimit),
        BigInt(maxSingleTx),
        BigInt(minSingleTx),
        requiresApprovedRecipients,
      ],
    });

    const receipt = await celoClient.waitForReceipt(hash);

    // If whitelist enabled, add recipients
    const recipientHashes: string[] = [];
    if (requiresApprovedRecipients && approvedRecipients.length > 0) {
      for (const recipient of approvedRecipients) {
        try {
          const rHash = await (celoClient as any).walletClient.writeContract({
            address: policyEngineAddr,
            abi: POLICY_ENGINE_ABI,
            functionName: "addApprovedRecipient",
            args: [business as `0x${string}`, recipient as `0x${string}`],
          });
          await celoClient.waitForReceipt(rHash);
          recipientHashes.push(rHash);
        } catch (err: any) {
          console.warn(`Failed to add recipient ${recipient}:`, err.message);
        }
      }
    }

    return res.json({
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
      policyEngineAddress: policyEngineAddr,
      business,
      dailyLimitFormatted: (Number(BigInt(dailyLimit)) / 1e18).toFixed(2) + " USDm",
      maxSingleTxFormatted: (Number(BigInt(maxSingleTx)) / 1e18).toFixed(2) + " USDm",
      recipientsAdded: recipientHashes.length,
      explorerUrl: `${celoClient.explorerUrl}/tx/${hash}`,
    });
  } catch (err: any) {
    console.error("[Policy API]", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/policy/:business
 * Read current policy for a business address.
 */
router.get("/:business", async (req: Request, res: Response) => {
  if (!isAddress(req.params.business)) {
    return res.status(400).json({ error: "Invalid address" });
  }

  try {
    const celoClient = getCeloClient("reader");
    const result = await celoClient.getPolicy(req.params.business as `0x${string}`);

    const [dailyLimit, maxSingleTx, minSingleTx, dailySpent, active, requiresApprovedRecipients, remainingToday] =
      result as [bigint, bigint, bigint, bigint, boolean, boolean, bigint];

    return res.json({
      business: req.params.business,
      dailyLimit: dailyLimit.toString(),
      dailyLimitFormatted: (Number(dailyLimit) / 1e18).toFixed(4),
      maxSingleTx: maxSingleTx.toString(),
      maxSingleTxFormatted: (Number(maxSingleTx) / 1e18).toFixed(4),
      minSingleTx: minSingleTx.toString(),
      dailySpent: dailySpent.toString(),
      dailySpentFormatted: (Number(dailySpent) / 1e18).toFixed(4),
      remainingToday: remainingToday.toString(),
      remainingTodayFormatted: (Number(remainingToday) / 1e18).toFixed(4),
      utilizationPct: dailyLimit > 0n
        ? Number((dailySpent * 100n) / dailyLimit)
        : 0,
      active,
      requiresApprovedRecipients,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
