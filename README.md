# PayForge Orchestra

**Autonomous freelancer payment agent on Celo.**  
Nigerian freelancers invoice global clients in USDm. Five ERC-8004 agents route through
Mento, convert to NGNm, and attest every action onchain. 0.1% fees vs 7–15% via PayPal.

Built for the [Celo Onchain Agents Hackathon 2026](https://celoplatform.notion.site) — competing on all three tracks.

---

## The pitch

> "Invoice Acme Corp $500. Agent converts USDm → NGNm via Mento. NGNm lands in Lagos wallet in seconds. Full audit trail onchain."

African freelancers bleed $2–3B/year to PayPal/Payoneer fees. NGNm (Mento Nigerian Naira) + USDm on Celo makes this a solved problem — PayForge is the autonomous agent layer on top.

---

## Architecture

```
User / Dashboard
      │
      ▼
Supervisor Agent  (ERC-8004 #001) ← LangGraph orchestrator
      │
      ├── FX Router Agent   (#002) ← Mento USDm→NGNm quote + best route
      ├── Policy Agent      (#003) ← onchain + LLM risk check  
      ├── Execution Agent   (#004) ← signs tx, gas paid in USDm
      └── Recon Agent       (#005) ← attestation + ERC-8004 feedback
                │
         Smart Contracts (Celo Sepolia)
         ├── PolicyEngine.sol        ← onchain spending limits
         ├── PaymentOrchestrator.sol ← Mento FX + transfer
         ├── AttestationLogger.sol   ← immutable audit log
         └── FeeVault.sol            ← USDm gas funding
```

---

## Verified addresses (Celo Sepolia — chain 11142220)

| Token | Symbol | Address |
|---|---|---|
| Mento Dollar | USDm | `0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b` |
| Mento Nigerian Naira | NGNm | `0x3d5ae86F34E2a82771496D140daFAEf3789dF888` |
| Mento Kenyan Shilling | KESm | `0xC7e4635651E3e3Af82b61d3E23c159438daE3BbF` |
| Mento Euro | EURm | `0xA99dC247d6b7B2E3ab48a1fEE101b83cD6aCd82a` |
| Mento Broker | — | `0x777A8255cA72412f0d706dc03C9D1987306B4CaD` |
| ERC-8004 Identity | — | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |

Source: https://docs.celo.org/tooling/contracts/token-contracts

---

## Prerequisites

- Node.js ≥ 18
- Celo Sepolia CELO for gas → **https://faucet.celo.org/celo-sepolia**
- Celo Sepolia USDm → swap at **https://app.mento.org** (CELO → USDm, switch to Sepolia)
- **Groq API key (FREE)** → **https://console.groq.com** (30 seconds, no credit card)
- Supabase project (free tier) → **https://supabase.com**

---

## Step 1 — Unzip and install

```bash
unzip payforge-orchestra.zip
cd payforge

cd contracts && npm install && cd ..
cd agents    && npm install && cd ..
cd frontend  && npm install && cd ..
```

---

## Step 2 — Environment files

```bash
cp contracts/.env.example contracts/.env
# Fill: DEPLOYER_PRIVATE_KEY, CELOSCAN_API_KEY (optional)

cp agents/.env.example agents/.env
# Fill: GROQ_API_KEY (free from console.groq.com)
#       DEPLOYER_PRIVATE_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
# Agent private keys come from Step 4 below

cp frontend/.env.example frontend/.env.local
# Fill: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
#       NEXT_PUBLIC_DEMO_BUSINESS, NEXT_PUBLIC_DEMO_RECIPIENT
```

---

## Step 3 — Supabase setup

1. Create project at https://supabase.com → Settings → API → copy URL and keys
2. SQL Editor → paste the migration SQL from `agents/src/tools/supabase.ts` (the `SUPABASE_MIGRATION_SQL` export)
3. Run → creates `payments`, `agent_status`, `trace_logs` tables with realtime enabled

---

## Step 4 — Deploy contracts + register agents

```bash
cd contracts

# Compile
npm run compile

# Deploy all 4 contracts to Celo Sepolia
# Generates 5 agent wallets → writes deployments/celo-sepolia.json
npm run deploy:sepolia

# Register all 5 agents in ERC-8004 IdentityRegistry
# Agents appear on 8004scan immediately after this step (Track 3!)
npm run register:sepolia

# Optional: verify on Celoscan
npm run verify:sepolia -- --address <CONTRACT_ADDRESS>
```

After this step, open `contracts/deployments/celo-sepolia.json` and copy the five
agent `privateKey` values into `agents/.env`.

---

## Step 5 — Fund agents + approve orchestrator

```bash
# The FeeVault auto-funds agents at deploy time.
# If wallets are empty after a day, run topUpAllAgents() from the owner wallet.

# IMPORTANT: approve PaymentOrchestrator to spend USDm from your business wallet
# (Replace <ORCHESTRATOR_ADDR> and <BUSINESS_KEY> with values from celo-sepolia.json)
cast send 0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b \
  "approve(address,uint256)" \
  <ORCHESTRATOR_ADDR> 1000000000000000000000 \
  --rpc-url https://forno.celo-sepolia.celo-testnet.org \
  --private-key <BUSINESS_KEY>

# Configure business policy (or use the dashboard Config page)
curl -X POST http://localhost:3001/api/policy \
  -H "Content-Type: application/json" \
  -d '{
    "business": "<YOUR_BUSINESS_WALLET>",
    "dailyLimit":  "1000000000000000000000",
    "maxSingleTx": "500000000000000000000",
    "minSingleTx": "1000000000000000000",
    "requiresApprovedRecipients": false,
    "approvedRecipients": []
  }'
```

---

## Step 6 — Start and demo

```bash
# Terminal 1: agent service
cd agents && npm run dev
# → http://localhost:3001

# Terminal 2: frontend
cd frontend && npm run dev
# → http://localhost:3000

# Trigger a live USDm → NGNm payment
curl -X POST http://localhost:3001/api/payment \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "10000000000000000000",
    "fromCurrency": "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b",
    "toCurrency":   "0x3d5ae86F34E2a82771496D140daFAEf3789dF888",
    "recipient": "<RECIPIENT_WALLET>",
    "business":  "<BUSINESS_WALLET>",
    "memo": "Freelance design work — May 2026"
  }'
```

Each payment flow = **4 onchain transactions** (policy check, Mento swap + transfer,
agent action logs, attestation). Press the dashboard demo button repeatedly to build
Track 2 transaction volume.

---

## Hackathon registration tweet

```
I am building for the @CeloDevs Agent Hackathon 🟡
Working on: PayForge Orchestra — 5-agent freelancer payment system.
Nigerian freelancers get paid in USDm, agents auto-convert to NGNm via Mento. No bank needed.
Registered onchain → [your 8004scan link]
Let's go 🛠️ #CeloAgents @Celo @CeloDevs
```

---

## Submit via Celo Builders Skill

```bash
npx skills add https://celobuilders.xyz
# Prompt: "Help me submit my project to the Celo Onchain Agents Hackathon"
# Select: celo-onchain-agents
```

---

## Track coverage

| Track | Strategy |
|---|---|
| **Track 1 — Best Agent** | 5-agent LangGraph system, NGNm corridor, onchain policy, EAS attestations, live reasoning dashboard. Real-world use case for $20B+ African freelance market |
| **Track 2 — Most Transactions** | Each demo payment = 4+ txns. 20 presses = 80+ txns. Leave demo running |
| **Track 3 — Highest 8004scan Rank** | 5 ERC-8004 registrations immediately after `register:sepolia`. Each agent builds activity independently |

---

## Project structure

```
payforge/
├── contracts/
│   ├── contracts/
│   │   ├── interfaces/IERC8004.sol, IMentoBroker.sol
│   │   ├── PolicyEngine.sol
│   │   ├── PaymentOrchestrator.sol
│   │   ├── AttestationLogger.sol
│   │   └── FeeVault.sol
│   ├── scripts/deploy.ts, register-agents.ts
│   └── deployments/          ← auto-generated (gitignore this!)
├── agents/src/
│   ├── agents/               ← 5 LangGraph nodes
│   ├── graph/state.ts + workflow.ts
│   ├── tools/celo.ts + mento.ts + supabase.ts + llm.ts
│   ├── config/addresses.ts   ← all verified Celo Sepolia addresses
│   ├── api/policy.ts
│   └── index.ts
└── frontend/app/
    ├── page.tsx              ← freelancer story landing
    ├── dashboard/page.tsx    ← live monitoring + demo button
    └── config/page.tsx       ← policy configuration
```
