import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Minimal ERC-8004 IdentityRegistry ABI for registration
const IDENTITY_REGISTRY_ABI = [
  "function register(string calldata agentURI) external returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string calldata agentURI) external",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function totalSupply() external view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

const REPUTATION_REGISTRY_ABI = [
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string calldata tag1, string calldata tag2, string calldata endpointURI, string calldata fileURI, bytes32 fileHash) external",
  "function getSummary(uint256 agentId) external view returns (uint256 feedbackCount, int128 averageValue)",
];

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const isSepolia = chainId === 11142220;

  const identityRegistryAddress = isSepolia
    ? "0x8004A818BFB912233c491871b3d84c89A494BD9e"
    : "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

  const reputationRegistryAddress = isSepolia
    ? "0x8004B663056A597Dffe9eCcC1965A193B7388713"
    : "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";

  // Load deployment artifact
  const deploymentPath = path.join(
    __dirname,
    `../deployments/${isSepolia ? "celo-sepolia" : "celo"}.json`
  );
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment artifact not found at ${deploymentPath}. Run deploy.ts first.`);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));

  const [deployer] = await ethers.getSigners();
  console.log(`\n🤖 Registering agents on ERC-8004 IdentityRegistry`);
  console.log(`Network: ${isSepolia ? "Celo Sepolia (chain 11142220)" : "Celo Mainnet"}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`IdentityRegistry: ${identityRegistryAddress}`);
  console.log(`Explorer: ${isSepolia ? "https://sepolia.celoscan.io" : "https://celoscan.io"}\n`);

  const identityRegistry = new ethers.Contract(
    identityRegistryAddress,
    IDENTITY_REGISTRY_ABI,
    deployer
  );

  const reputationRegistry = new ethers.Contract(
    reputationRegistryAddress,
    REPUTATION_REGISTRY_ABI,
    deployer
  );

  const agentKeys = ["supervisor", "fxRouter", "policy", "execution", "reconciliation"];
  const registeredAgentIds: Record<string, number> = {};

  for (const agentKey of agentKeys) {
    const agentData = deployment.agents[agentKey];
    if (!agentData) {
      console.warn(`⚠️  No data for ${agentKey}, skipping`);
      continue;
    }

    // Build the registration file URI
    // In production: upload to IPFS and use ipfs://Qm... URI
    // For hackathon: use a hosted URL or data URI
    const regFilePath = path.join(__dirname, `../agent-registrations/${agentKey}.json`);
    let agentURI: string;

    if (fs.existsSync(regFilePath)) {
      // For the hackathon, host via GitHub raw or a simple endpoint.
      // We encode the JSON directly as a data URI for immediate testnet use.
      const regContent = fs.readFileSync(regFilePath, "utf-8");
      const base64 = Buffer.from(regContent).toString("base64");
      agentURI = `data:application/json;base64,${base64}`;
    } else {
      agentURI = `https://payforge-orchestra.vercel.app/api/agents/${agentKey}/registration`;
    }

    console.log(`Registering ${agentKey} (${agentData.address})...`);

    try {
      // The deployer wallet registers on behalf of each agent.
      // Each agent NFT will be owned by the deployer; agents can then be transferred
      // to the agent wallets for full ERC-8004 compliance.
      const tx = await identityRegistry.register(agentURI);
      const receipt = await tx.wait();

      // Parse Transfer event to get the minted token ID
      const transferEvent = receipt.logs
        .map((log: any) => {
          try {
            return identityRegistry.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e: any) => e?.name === "Transfer");

      const agentId = transferEvent
        ? Number(transferEvent.args.tokenId)
        : null;

      console.log(`  ✅ Registered! ERC-8004 agentId: ${agentId ?? "unknown"}`);
      console.log(`     Tx: ${receipt.hash}`);

      if (agentId !== null) {
        registeredAgentIds[agentKey] = agentId;
        deployment.agents[agentKey].erc8004AgentId = agentId;

        // Submit initial positive feedback from deployer to boost reputation
        // (deployer is the "business owner" vouching for their own agents)
        try {
          const feedbackTx = await reputationRegistry.giveFeedback(
            agentId,
            ethers.parseUnits("1", 18), // rating: 1.0 (positive)
            18,                          // value uses 18 decimals
            "payment_system",            // tag1
            "initialized",               // tag2
            `https://payforge-orchestra.vercel.app/api/agents/${agentKey}`,
            "",                          // no file URI
            ethers.ZeroHash              // no file hash
          );
          await feedbackTx.wait();
          console.log(`  ⭐ Submitted initial reputation feedback`);
        } catch (repErr: any) {
          console.warn(`  ⚠️  Reputation feedback failed (not blocking): ${repErr.message}`);
        }
      }
    } catch (err: any) {
      console.error(`  ❌ Failed to register ${agentKey}: ${err.message}`);
      // Don't abort — continue with remaining agents
    }

    // Small delay between registrations to avoid nonce issues
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Update deployment artifact with ERC-8004 agent IDs
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log(`\n✅ Agent registration complete`);
  console.log(`   Registered IDs: ${JSON.stringify(registeredAgentIds, null, 2)}`);
  console.log(`   Artifact updated: ${deploymentPath}`);
  console.log(`\n🔗 View on 8004scan: https://8004scan.io`);
  const explorerBase = isSepolia ? "https://sepolia.celoscan.io" : "https://celoscan.io";
  console.log(`🔗 Explorer: ${explorerBase}`);
  console.log(`\n⚠️  NEXT STEP: Copy agent private keys from ${deploymentPath}`);
  console.log(`   into agents/.env, then run: cd agents && npm run dev\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
