import { keccak256, toHex } from "viem";
import { PaymentState, makeTrace, isQuoteStale, FXQuote } from "../graph/state";
import { getMentoService } from "../tools/mento";
import { callLLM, callLLMJSON } from "../tools/llm";
import { getSymbol } from "../config/addresses";

const AGENT_ID = "fx-router";

export async function fxRouterAgent(state: PaymentState): Promise<Partial<PaymentState>> {
  const start = Date.now();
  const { request } = state;

  // Same-currency: no FX needed
  if (request.fromCurrency.toLowerCase() === request.toCurrency.toLowerCase()) {
    return {
      fxQuote: {
        exchangeProvider: "0x0000000000000000000000000000000000000000",
        exchangeId: "0x0000000000000000000000000000000000000000000000000000000000000000",
        amountOut: request.amount,
        amountOutFormatted: formatAmount(BigInt(request.amount)),
        rate: "1.000000",
        slippageBps: 0,
        minAmountOut: request.amount,
        quotedAt: new Date().toISOString(),
        path: [request.fromCurrency],
      },
      status: "fx_quoted",
      trace: [makeTrace(AGENT_ID, "same_currency", "Same-currency transfer — no swap needed", undefined, Date.now() - start)],
    };
  }

  // Re-use fresh quote if already present
  if (state.fxQuote && !isQuoteStale(state.fxQuote)) {
    return {
      status: "fx_quoted",
      trace: [makeTrace(AGENT_ID, "cache_hit",
        `Cached quote: 1 ${getSymbol(request.fromCurrency)} = ${state.fxQuote.rate} ${getSymbol(request.toCurrency)}`,
        undefined, Date.now() - start)],
    };
  }

  // Fetch from Mento
  const slippageBps = parseInt(process.env.FX_SLIPPAGE_OVERRIDE ?? "100");
  let quoteResult;
  try {
    const mento = getMentoService();
    quoteResult = await mento.getBestQuote(
      request.fromCurrency,
      request.toCurrency,
      BigInt(request.amount),
      slippageBps
    );
  } catch (err: any) {
    return {
      status: "failed",
      error: `FX Router: no Mento route for ${getSymbol(request.fromCurrency)} → ${getSymbol(request.toCurrency)} — ${err.message}`,
      trace: [makeTrace(AGENT_ID, "no_route",
        `No route found: ${getSymbol(request.fromCurrency)} → ${getSymbol(request.toCurrency)}`,
        err.message, Date.now() - start)],
    };
  }

  const best = quoteResult.bestRoute;

  // LLM rate sanity check (free via Groq, non-blocking)
  const rateAssessment = await callLLM(
    `You are the FX Router Agent for PayForge Orchestra, a freelancer payment system on Celo.
Mento Protocol quoted: 1 ${getSymbol(request.fromCurrency)} = ${best.rate} ${getSymbol(request.toCurrency)}
Routes found: ${quoteResult.allRoutes.length}
In one sentence: is this rate reasonable for current market conditions? Flag if suspicious.`
  );

  const quote: FXQuote = {
    exchangeProvider: best.exchangeProvider,
    exchangeId: best.exchangeId,
    amountOut: best.amountOut.toString(),
    amountOutFormatted: best.amountOutFormatted,
    rate: best.rate,
    slippageBps: best.slippageBps,
    minAmountOut: best.minAmountOut.toString(),
    quotedAt: quoteResult.quoteTimestamp,
    path: best.path ?? [request.fromCurrency, request.toCurrency],
  };

  return {
    fxQuote: quote,
    status: "fx_quoted",
    trace: [makeTrace(AGENT_ID, "quote_fetched",
      `Rate: 1 ${getSymbol(request.fromCurrency)} = ${best.rate} ${getSymbol(request.toCurrency)} | Out: ${best.amountOutFormatted} ${getSymbol(request.toCurrency)} | Slippage: ${slippageBps / 100}%`,
      rateAssessment || undefined,
      Date.now() - start)],
  };
}

function formatAmount(amount: bigint): string {
  const d = BigInt(1e18);
  return `${amount / d}.${(amount % d).toString().padStart(18, "0").slice(0, 4)}`;
}
