import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ORCHESTRATOR_ABI = [
  "function authorizeAgent(address agent, bytes32 agentId) external",
  "function authorizedAgents(address) view returns (bool)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const deployment = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../deployments/celo.json"),
      "utf-8"
    )
  );

  const orchestrator = new ethers.Contract(
    deployment.contracts.paymentOrchestrator,
    ORCHESTRATOR_ABI,
    deployer
  );

  const agents = [
    "supervisor",
    "fxRouter",
    "policy",
    "execution",
    "reconciliation",
  ];

  for (let i = 0; i < agents.length; i++) {
    const key = agents[i];
    const agentData = deployment.agents[key];
    if (!agentData?.address) {
      console.log(`⚠️  No address for ${key}, skipping`);
      continue;
    }

    // Check if already authorized
    const isAuthorized = await orchestrator.authorizedAgents(agentData.address);
    if (isAuthorized) {
      console.log(`✅ ${key} already authorized: ${agentData.address}`);
      continue;
    }

    const agentIdBytes32 = ethers.zeroPadValue(ethers.toBeHex(i + 1), 32);
    console.log(`Authorizing ${key}: ${agentData.address}...`);
    const tx = await orchestrator.authorizeAgent(agentData.address, agentIdBytes32);
    await tx.wait();
    console.log(`✅ Authorized ${key} | Tx: ${tx.hash}`);
  }

  console.log("\n✅ All agents authorized");
}

main().catch(console.error);