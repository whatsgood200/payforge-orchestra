import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Real deployed contract addresses
// ─────────────────────────────────────────────────────────────────────────────

const ADDRESSES = {
  celoSepolia: {
    // Verified from https://docs.celo.org/tooling/contracts/token-contracts
    mentoBroker: "0xB9Ae2065142EB79b6c5EB1E8778F883fad6B07Ba",
    USDm: "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b",  // Mento Dollar (was cUSD)
    NGNm: "0x3d5ae86F34E2a82771496D140daFAEf3789dF888",  // Mento Nigerian Naira ★
    KESm: "0xC7e4635651E3e3Af82b61d3E23c159438daE3BbF",  // Mento Kenyan Shilling
    EURm: "0xA99dC247d6b7B2E3ab48a1fEE101b83cD6aCd82a",  // Mento Euro
    erc8004Identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    erc8004Reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  },
  celo: {
    mentoBroker: "0x777b8e2f5f356c5c284342afbf009d6552450d69",
    USDm: "0x765DE816845861e75A25fCA122bb6898B8B1282a",  // Mento Dollar (was cUSD)
    NGNm: "0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71",  // Mento Nigerian Naira ★
    KESm: "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0",  // Mento Kenyan Shilling
    EURm: "0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73",  // Mento Euro
    BRLm: "0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787",  // Mento Brazilian Real
    erc8004Identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    erc8004Reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Agent registration file templates — uploaded to IPFS in production,
// hosted at a public URL for the hackathon demo.
// ─────────────────────────────────────────────────────────────────────────────

function buildAgentRegistrationFile(
  name: string,
  description: string,
  role: string,
  walletAddress: string,
  supervisorAddress?: string
) {
  return {
    type: "Agent",
    name,
    description,
    version: "1.0.0",
    created: new Date().toISOString(),
    endpoints: [
      {
        type: "a2a",
        url: `https://payforge-orchestra.vercel.app/api/agents/${role}`,
      },
    ],
    wallet: {
      address: walletAddress,
      chainId: 11142220, // Celo Sepolia
      currency: "USDm",
    },
    capabilities: [role],
    supervisor: supervisorAddress ?? null,
    project: "PayForge Orchestra",
    hackathon: "Celo Onchain Agents Hackathon 2026",
    supportedTrust: ["reputation"],
  };
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const isSepolia = chainId === 11142220;
  const addrs = isSepolia ? ADDRESSES.celoSepolia : ADDRESSES.celo;

  console.log(`\n🚀 Deploying PayForge Orchestra to ${isSepolia ? "Celo Sepolia" : "Celo Mainnet"}`);
  console.log(`Chain ID: ${chainId}`);
  if (isSepolia) {
    console.log(`Explorer: https://sepolia.celoscan.io`);
    console.log(`Faucet:   https://faucet.celo.org/celo-sepolia`);
  }

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} CELO\n`);

  // ─── 1. Deploy AttestationLogger ──────────────────────────────────────────
  console.log("1/4  Deploying AttestationLogger...");
  const AttestationLogger = await ethers.getContractFactory("AttestationLogger");
  const attestationLogger = await AttestationLogger.deploy();
  await attestationLogger.waitForDeployment();
  const attestationLoggerAddress = await attestationLogger.getAddress();
  console.log(`     AttestationLogger: ${attestationLoggerAddress}`);

  // ─── 2. Deploy PolicyEngine ───────────────────────────────────────────────
  console.log("2/4  Deploying PolicyEngine...");
  const PolicyEngine = await ethers.getContractFactory("PolicyEngine");
  const policyEngine = await PolicyEngine.deploy();
  await policyEngine.waitForDeployment();
  const policyEngineAddress = await policyEngine.getAddress();
  console.log(`     PolicyEngine: ${policyEngineAddress}`);

  // ─── 3. Deploy PaymentOrchestrator ────────────────────────────────────────
  console.log("3/4  Deploying PaymentOrchestrator...");
  const PaymentOrchestrator = await ethers.getContractFactory("PaymentOrchestrator");
  const orchestrator = await PaymentOrchestrator.deploy(
    policyEngineAddress,
    addrs.mentoBroker,
    attestationLoggerAddress
  );
  await orchestrator.waitForDeployment();
  const orchestratorAddress = await orchestrator.getAddress();
  console.log(`     PaymentOrchestrator: ${orchestratorAddress}`);

  // ─── 4. Deploy FeeVault ───────────────────────────────────────────────────
  console.log("4/4  Deploying FeeVault...");
  const FeeVault = await ethers.getContractFactory("FeeVault");
  const feeVault = await FeeVault.deploy(addrs.USDm);
  await feeVault.waitForDeployment();
  const feeVaultAddress = await feeVault.getAddress();
  console.log(`     FeeVault: ${feeVaultAddress}`);

  // ─── Wire up contracts ────────────────────────────────────────────────────
  console.log("\n🔧 Wiring contracts...");

  // PolicyEngine: authorize orchestrator as caller
  let tx = await policyEngine.authorizeCaller(orchestratorAddress);
  await tx.wait();
  console.log("     PolicyEngine ← authorized PaymentOrchestrator");

  // AttestationLogger: authorize orchestrator as logger
  tx = await attestationLogger.authorizeLogger(orchestratorAddress);
  await tx.wait();
  console.log("     AttestationLogger ← authorized PaymentOrchestrator");

  // ─── Generate 5 agent wallets ─────────────────────────────────────────────
  console.log("\n🤖 Generating agent wallets...");

  const agentWallets = {
    supervisor: ethers.Wallet.createRandom(),
    fxRouter: ethers.Wallet.createRandom(),
    policy: ethers.Wallet.createRandom(),
    execution: ethers.Wallet.createRandom(),
    reconciliation: ethers.Wallet.createRandom(),
  };

  const agentConfigs = [
    {
      key: "supervisor",
      wallet: agentWallets.supervisor,
      name: "PayForge Supervisor",
      description: "Orchestrates multi-agent payment workflows. Decomposes payment requests, assigns specialist agents, monitors execution, handles retries.",
      role: "supervisor",
    },
    {
      key: "fxRouter",
      wallet: agentWallets.fxRouter,
      name: "PayForge FX Router",
      description: "Optimizes cross-currency routes via Mento Protocol. Finds best exchange routes for USDm → NGNm, KESm, EURm and 14+ Mento stablecoins.",
      role: "fx-router",
      supervisorAddress: agentWallets.supervisor.address,
    },
    {
      key: "policy",
      wallet: agentWallets.policy,
      name: "PayForge Policy Agent",
      description: "Enforces business spending policies. Checks onchain PolicyEngine rules and performs risk assessment before approving payments.",
      role: "policy",
      supervisorAddress: agentWallets.supervisor.address,
    },
    {
      key: "execution",
      wallet: agentWallets.execution,
      name: "PayForge Execution Agent",
      description: "Signs and broadcasts payment transactions. Manages nonce sequencing, gas estimation in USDm, and failure recovery.",
      role: "execution",
      supervisorAddress: agentWallets.supervisor.address,
    },
    {
      key: "reconciliation",
      wallet: agentWallets.reconciliation,
      name: "PayForge Reconciliation Agent",
      description: "Verifies payment settlements, records EAS-compatible attestations, updates reputation scores, and generates audit trails.",
      role: "reconciliation",
      supervisorAddress: agentWallets.supervisor.address,
    },
  ];

  // ─── Register agents in FeeVault ──────────────────────────────────────────
  for (const cfg of agentConfigs) {
    tx = await feeVault.registerAgent(cfg.wallet.address);
    await tx.wait();
    console.log(`     Registered ${cfg.key}: ${cfg.wallet.address}`);
  }

  // ─── Authorize agent wallets in PaymentOrchestrator ───────────────────────
  console.log("\n🔑 Authorizing agents in PaymentOrchestrator...");
  const agentIds = [1n, 2n, 3n, 4n, 5n]; // Will be actual ERC-8004 token IDs after registration
  for (let i = 0; i < agentConfigs.length; i++) {
    const cfg = agentConfigs[i];
    const agentIdBytes32 = ethers.zeroPadValue(ethers.toBeHex(agentIds[i]), 32);
    tx = await orchestrator.authorizeAgent(cfg.wallet.address, agentIdBytes32);
    await tx.wait();
    console.log(`     Authorized ${cfg.key} (agentId placeholder: ${agentIds[i]})`);
  }

  // ─── Build registration files ─────────────────────────────────────────────
  console.log("\n📄 Building ERC-8004 registration files...");
  const registrationDir = path.join(__dirname, "../agent-registrations");
  fs.mkdirSync(registrationDir, { recursive: true });

  for (const cfg of agentConfigs) {
    const regFile = buildAgentRegistrationFile(
      cfg.name,
      cfg.description,
      cfg.role,
      cfg.wallet.address,
      (cfg as any).supervisorAddress
    );
    const filePath = path.join(registrationDir, `${cfg.key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(regFile, null, 2));
    console.log(`     Written ${cfg.key}.json`);
  }

  // ─── Write deployment artifacts ───────────────────────────────────────────
  const deployment = {
    network: isSepolia ? "celoSepolia" : "celo",
    chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      policyEngine: policyEngineAddress,
      paymentOrchestrator: orchestratorAddress,
      attestationLogger: attestationLoggerAddress,
      feeVault: feeVaultAddress,
    },
    externalContracts: {
      mentoBroker: addrs.mentoBroker,
      USDm: addrs.USDm,
      erc8004Identity: addrs.erc8004Identity,
      erc8004Reputation: addrs.erc8004Reputation,
    },
    agents: Object.fromEntries(
      agentConfigs.map((cfg, i) => [
        cfg.key,
        {
          address: cfg.wallet.address,
          privateKey: cfg.wallet.privateKey,
          mnemonic: cfg.wallet.mnemonic?.phrase ?? null,
          erc8004AgentId: null, // populated after register-agents script runs
        },
      ])
    ),
  };

  const artifactPath = path.join(__dirname, `../deployments/${isSepolia ? "celo-sepolia" : "celo"}.json`);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify(deployment, null, 2));

  console.log(`\n✅ Deployment complete. Artifacts: ${artifactPath}`);
  console.log("\n📋 Contract addresses:");
  console.log(`   PolicyEngine:          ${policyEngineAddress}`);
  console.log(`   PaymentOrchestrator:   ${orchestratorAddress}`);
  console.log(`   AttestationLogger:     ${attestationLoggerAddress}`);
  console.log(`   FeeVault:              ${feeVaultAddress}`);
  console.log("\n⚠️  NEXT STEP: Run `npx hardhat run scripts/register-agents.ts --network celoSepolia`");
  console.log("   This will register all 5 agent wallets in ERC-8004 IdentityRegistry");
  console.log("   and update the deployment artifact with their token IDs.\n");
  console.log("⚠️  SECURITY: deployment.json contains private keys — DO NOT COMMIT\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
