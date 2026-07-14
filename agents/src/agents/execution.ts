import { keccak256, toHex, formatUnits, parseUnits, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient } from "viem";
import { celo, celoAlfajores } from "viem/chains";
import { PaymentState, makeTrace, ExecutionResult } from "../graph/state";
import { getCeloClient, ERC20_ABI } from "../tools/celo";
import { getAddresses, CHAIN_IDS } from "../config/addresses";

const AGENT_ID = "execution";

const MENTO_BROKER_ABI = [
  {
    name: "swapIn",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "exchangeProvider", type: "address" },
      { name: "exchangeId", type: "bytes32" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

export async function executionAgent(state: PaymentState): Promise<Partial<PaymentState>> {
  const start = Date.now();
  const { request, fxQuote, paymentId } = state;

  if (!fxQuote) {
    return {
      status: "failed",
      error: "Execution Agent: fxQuote missing",
      trace: [makeTrace(AGENT_ID, "missing_quote", "No FX quote in state")],
    };
  }

  const businessPrivateKey = process.env.BUSINESS_PRIVATE_KEY as `0x${string}`;
  if (!businessPrivateKey) {
    return {
      status: "failed",
      error: "BUSINESS_PRIVATE_KEY not set",
      trace: [makeTrace(AGENT_ID, "config_error", "Missing business private key")],
    };
  }

  const chainId = parseInt(process.env.CHAIN_ID ?? "11142220");
  const addrs = getAddresses(chainId);
  const chain = chainId === CHAIN_IDS.CELO ? celo : celoAlfajores;

  // Business wallet client — signs directly (bypasses orchestrator)
  const businessAccount = privateKeyToAccount(businessPrivateKey);
  const businessClient = createWalletClient({
    account: businessAccount,
    chain,
    transport: http(addrs.rpc),
  });

  const publicClient = createPublicClient({ chain, transport: http(addrs.rpc) });

  const amountIn = BigInt(request.amount);
  const isSameCurrency = request.fromCurrency.toLowerCase() === request.toCurrency.toLowerCase();

  try {
    let txHash: `0x${string}`;

    if (isSameCurrency) {
      // Direct ERC-20 transfer — no swap needed
      txHash = await businessClient.writeContract({
        address: request.fromCurrency,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [request.recipient, amountIn],
      });
    } else {
      // Step 1: Approve Mento broker to spend tokenIn from business wallet
      const currentAllowance = await publicClient.readContract({
        address: request.fromCurrency,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [businessAccount.address, addrs.mentoBroker],
      }) as bigint;

      if (currentAllowance < amountIn) {
        const approveTx = await businessClient.writeContract({
          address: request.fromCurrency,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [addrs.mentoBroker, amountIn * 100n], // approve 100x for headroom
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx, timeout: 60_000 });
      }

      // Step 2: Call Mento swapIn directly from business wallet
      // Output goes to business wallet first, then we transfer to recipient
      txHash = await businessClient.writeContract({
        address: addrs.mentoBroker,
        abi: MENTO_BROKER_ABI,
        functionName: "swapIn",
        args: [
          fxQuote.exchangeProvider as `0x${string}`,
          fxQuote.exchangeId as `0x${string}`,
          request.fromCurrency,
          request.toCurrency,
          amountIn,
          1n, // minAmountOut = 1 to eliminate slippage failure
        ],
      });

      const swapReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 90_000 });

      if (swapReceipt.status === "reverted") {
        return {
          status: "failed",
          error: `Mento swap reverted: ${txHash}`,
          trace: [makeTrace(AGENT_ID, "swap_reverted", `Swap tx reverted: ${txHash}`, undefined, Date.now() - start)],
        };
      }

      // Step 3: Transfer NGNm from business wallet to recipient
      if (request.recipient.toLowerCase() !== businessAccount.address.toLowerCase()) {
        const ngNmBalance = await publicClient.readContract({
          address: request.toCurrency,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [businessAccount.address],
        }) as bigint;

        const transferTx = await businessClient.writeContract({
          address: request.toCurrency,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [request.recipient, ngNmBalance],
        });

        await publicClient.waitForTransactionReceipt({ hash: transferTx, timeout: 60_000 });
        txHash = transferTx; // use transfer tx as the primary tx hash
      }
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 90_000 });

    if (receipt.status === "reverted") {
      return {
        status: "failed",
        error: `Transaction reverted: ${txHash}`,
        trace: [makeTrace(AGENT_ID, "tx_reverted", `Tx reverted: ${txHash}`, undefined, Date.now() - start)],
      };
    }

    const result: ExecutionResult = {
      txHash,
      blockNumber: Number(receipt.blockNumber),
      gasUsed: receipt.gasUsed.toString(),
      feeCurrency: request.fromCurrency,
      gasCostCUSD: "0.001",
      confirmedAt: new Date().toISOString(),
    };

    const explorerBase = chainId === CHAIN_IDS.CELO ? "https://celoscan.io" : "https://sepolia.celoscan.io";

    return {
      executionResult: result,
      status: "awaiting_confirmation",
      trace: [makeTrace(
        AGENT_ID,
        "tx_confirmed",
        `${isSameCurrency ? "Direct transfer" : "Mento swap"} confirmed | Tx: ${txHash.slice(0, 18)}... | Block: ${receipt.blockNumber}`,
        `${explorerBase}/tx/${txHash}`,
        Date.now() - start
      )],
    };
  } catch (err: any) {
    const errMsg = err?.message?.slice(0, 300) ?? String(err);
    return {
      status: "failed",
      error: errMsg,
      trace: [makeTrace(AGENT_ID, "tx_failed", `Transaction failed: ${errMsg.slice(0, 100)}`, errMsg, Date.now() - start)],
    };
  }
}