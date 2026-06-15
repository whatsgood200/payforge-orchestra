import { ethers } from "hardhat";

async function main() {
  const USDM = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
  const ORCHESTRATOR = "0xb81f7eca0de77e1e1658277e3680f958bf1d2bc9";  // paste contracts.paymentOrchestrator here
  const BUSINESS_KEY = "0xbde63c257fd0085f4bd3e90093e2955e20615b84015937270bd5445fbc63a2e4";  // paste your business wallet private key here

  const business = new ethers.Wallet(BUSINESS_KEY, ethers.provider);
  const usdm = await ethers.getContractAt("IERC20", USDM, business);

  const tx = await usdm.approve(ORCHESTRATOR, ethers.parseEther("1000000"));
  await tx.wait();
  console.log("✅ Approved:", tx.hash);
}

main().catch(console.error);