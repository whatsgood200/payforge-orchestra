import { createPublicClient, http } from "viem";
import { celoSepolia } from "viem/chains";

const client = createPublicClient({
  chain: celoSepolia,
  transport: http("https://forno.celo-sepolia.celo-testnet.org"),
});

const BROKER = "0xB9Ae2065142EB79b6c5EB1E8778F883fad6B07Ba";
const PROVIDER = "0xeCB3C656C131fCd9bB8D1d80898716bD684feb78";
const USDM = "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b";
const NGNM = "0x471EcE3750Da237f93B8E339c536989b8978a438"; // CELO token

async function main() {
  // Get exchange ID for USDm/NGNm pool
  const exchanges = await client.readContract({
    address: PROVIDER as `0x${string}`,
    abi: [{ name: "getExchanges", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "tuple[]", components: [{ name: "exchangeId", type: "bytes32" }, { name: "assets", type: "address[]" }] }] }],
    functionName: "getExchanges",
  }) as any[];

  const pool = exchanges.find(e =>
    e.assets.map((a: string) => a.toLowerCase()).includes(NGNM.toLowerCase())
  );

  if (!pool) { console.log("Pool not found"); return; }
  console.log("Found pool, exchangeId:", pool.exchangeId);

  try {
    const amountOut = await client.readContract({
      address: BROKER as `0x${string}`,
      abi: [{ name: "getAmountOut", type: "function", stateMutability: "view", inputs: [{ type: "address" }, { type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] }],
      functionName: "getAmountOut",
      args: [PROVIDER as `0x${string}`, pool.exchangeId, USDM as `0x${string}`, NGNM as `0x${string}`, BigInt("10000000000000000000")],
    });
    console.log("✅ amountOut:", amountOut.toString());
  } catch (err) {
    console.log("❌ getAmountOut failed:", err);
  }
}

main().catch(console.error);