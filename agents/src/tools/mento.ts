import { createPublicClient, http } from "viem";
import { celoSepolia, celo } from "viem/chains";
import { getAddresses, getSymbol, CHAIN_IDS } from "../config/addresses";

// ─────────────────────────────────────────────────────────────────────────────
// Mento Broker ABI — only the functions we actually call
// Source: https://github.com/mento-protocol/mento-core
// ─────────────────────────────────────────────────────────────────────────────

const BROKER_ABI = [
  {
    name: "getAmountOut",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "exchangeProvider", type: "address" },
      { name: "exchangeId", type: "bytes32" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    name: "getExchangeProviders",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
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

const EXCHANGE_PROVIDER_ABI = [
  {
    name: "getExchanges",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "exchangeId", type: "bytes32" },
          { name: "assets", type: "address[]" },
        ],
      },
    ],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ExchangeRoute {
  exchangeProvider: `0x${string}`;
  exchangeId: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountOut: bigint;
  amountOutFormatted: string;
  rate: string;
  slippageBps: number;
  minAmountOut: bigint;
  path: string[];
}

export interface FXQuoteResult {
  bestRoute: ExchangeRoute;
  allRoutes: ExchangeRoute[];
  quoteTimestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MentoService — pure viem, no ethers dependency
// ─────────────────────────────────────────────────────────────────────────────

export class MentoService {
  private client: ReturnType<typeof createPublicClient>;
  private chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
    const addrs = getAddresses(chainId);
    const chain = chainId === CHAIN_IDS.CELO ? celo : celoSepolia;
    this.client = createPublicClient({
      chain,
      transport: http(addrs.rpc),
    })as any;
  }

  /**
   * Find the best exchange route for tokenIn → tokenOut.
   * Queries all Mento exchange providers dynamically — no hardcoded pool IDs.
   */
  async getBestQuote(
    tokenIn: `0x${string}`,
    tokenOut: `0x${string}`,
    amountIn: bigint,
    slippageBps = 100 // 1% default
  ): Promise<FXQuoteResult> {
    const addrs = getAddresses(this.chainId);
    const brokerAddr = addrs.mentoBroker;

    // Get all registered exchange providers
    const providers = await this.client.readContract({
      address: brokerAddr,
      abi: BROKER_ABI,
      functionName: "getExchangeProviders",
    }) as `0x${string}`[];

    const routes: ExchangeRoute[] = [];

    for (const providerAddr of providers) {
      let exchanges: Array<{ exchangeId: `0x${string}`; assets: `0x${string}`[] }>;

      try {
        exchanges = await this.client.readContract({
          address: providerAddr,
          abi: EXCHANGE_PROVIDER_ABI,
          functionName: "getExchanges",
        }) as any;
      } catch {
        continue; // Provider may not implement getExchanges — skip
      }

      for (const exchange of exchanges) {
        const assets = exchange.assets.map((a) => a.toLowerCase());
        if (
          !assets.includes(tokenIn.toLowerCase()) ||
          !assets.includes(tokenOut.toLowerCase())
        ) {
          continue;
        }

        try {
          const amountOut = await this.client.readContract({
            address: brokerAddr,
            abi: BROKER_ABI,
            functionName: "getAmountOut",
            args: [providerAddr, exchange.exchangeId, tokenIn, tokenOut, amountIn],
          }) as bigint;

          if (amountOut > 0n) {
            const minAmountOut = (amountOut * BigInt(10000 - slippageBps)) / 10000n;
            const rate = (Number(amountOut) / Number(amountIn)).toFixed(6);
            const decimals = 18;
            const amountOutFormatted = (
              Number(amountOut) / 10 ** decimals
            ).toFixed(4);

            routes.push({
              exchangeProvider: providerAddr,
              exchangeId: exchange.exchangeId,
              tokenIn,
              tokenOut,
              amountOut,
              amountOutFormatted,
              rate,
              slippageBps,
              minAmountOut,
              path: [tokenIn, tokenOut],
            });
          }
        } catch (err) {
      console.log(`[mento] getAmountOut failed for pool ${exchange.exchangeId}:`, err);
      // This direction may not be supported — skip silently
    }
      }
    }

    if (routes.length === 0) {
      throw new Error(
        `No Mento route found: ${getSymbol(tokenIn)} → ${getSymbol(tokenOut)}. ` +
        `Check that both tokens are deployed on chain ${this.chainId}.`
      );
    }

    // Best = highest amountOut
    routes.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));

    return {
      bestRoute: routes[0],
      allRoutes: routes,
      quoteTimestamp: new Date().toISOString(),
    };
  }

  describeRoute(route: ExchangeRoute): string {
    return (
      `1 ${getSymbol(route.tokenIn)} = ${route.rate} ${getSymbol(route.tokenOut)} ` +
      `| min out: ${(Number(route.minAmountOut) / 1e18).toFixed(4)} ${getSymbol(route.tokenOut)} ` +
      `| slippage: ${route.slippageBps / 100}%`
    );
  }
}

// Singleton
let _service: MentoService | null = null;

export function getMentoService(): MentoService {
  if (!_service) {
    const chainId = parseInt(process.env.CHAIN_ID ?? "11142220");
    _service = new MentoService(chainId);
  }
  return _service;
}
