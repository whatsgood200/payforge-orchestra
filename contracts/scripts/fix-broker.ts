import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/celo.json"), "utf-8")
  );

  const CORRECT_BROKER = "0x777A8255cA72412f0d706dc03C9D1987306B4CaD";
  const orchestratorAddr = deployment.contracts.paymentOrchestrator;

  console.log("PaymentOrchestrator:", orchestratorAddr);
  console.log("Setting broker to:", CORRECT_BROKER);

  const orchestrator = new ethers.Contract(
    orchestratorAddr,
    ["function setBroker(address _broker) external", "function mentoBroker() view returns (address)"],
    deployer
  );

  // Check current broker
  const currentBroker = await orchestrator.mentoBroker();
  console.log("Current broker:", currentBroker);

  if (currentBroker.toLowerCase() === CORRECT_BROKER.toLowerCase()) {
    console.log("✅ Broker already correct!");
    return;
  }

  const tx = await orchestrator.setBroker(CORRECT_BROKER);
  await tx.wait();
  console.log("✅ Broker updated! Tx:", tx.hash);

  const newBroker = await orchestrator.mentoBroker();
  console.log("New broker confirmed:", newBroker);
}

main().catch(console.error);