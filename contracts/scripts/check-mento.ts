import { createPublicClient, http } from "viem";
import { celoSepolia } from "viem/chains";

const BROKER = "0x777b8e2f5f356c5c284342afbf009d6552450d69" as `0x${string}`;
const USDM   = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const NGNM   = "0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71";

const client = createPublicClient({
  chain: celoSepolia,
  transport: http("https://forno.celo-sepolia.celo-testnet.org"),
});

async function main() {
  const providers = await client.readContract({
    address: BROKER as `0x${string}`,
    abi: [{ name: "getExchangeProviders", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] }],
    functionName: "getExchangeProviders",
  }) as string[];

  console.log("Exchange providers:", providers);

  for (const p of providers) {
    const exchanges = await client.readContract({
      address: p as `0x${string}`,
      abi: [{ name: "getExchanges", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "tuple[]", components: [{ name: "exchangeId", type: "bytes32" }, { name: "assets", type: "address[]" }] }] }],
      functionName: "getExchanges",
    }) as any[];

    console.log(`\nProvider ${p}:`);
    for (const e of exchanges) {
      console.log(" Pool:", e.assets);
    }
  }
}

main().catch(console.error);