import {
  createPublicClient,
  createWalletClient,
  http,
  publicActions,
  type PublicClient,
  type WalletClient,
  type Account,
  type Hash,
  type TransactionReceipt,
  parseAbi,
  parseUnits,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celoSepolia, celo } from "viem/chains";
import { getAddresses, CHAIN_IDS } from "../config/addresses";

// ─────────────────────────────────────────────────────────────────────────────
// Contract ABIs (minimal — just what agents need)
// ─────────────────────────────────────────────────────────────────────────────

export const POLICY_ENGINE_ABI = parseAbi([
  "function simulateCheck(address business, address recipient, uint256 amount) view returns (bool approved, string reason, uint256 remainingDailyAllowance)",
  "function checkAndRecordSpend(address business, address recipient, uint256 amount) returns (bool approved, string reason)",
  "function getPolicy(address business) view returns (uint256 dailyLimit, uint256 maxSingleTx, uint256 minSingleTx, uint256 dailySpent, bool active, bool requiresApprovedRecipients, uint256 remainingToday)",
  "function configurePolicy(address business, uint256 dailyLimit, uint256 maxSingleTx, uint256 minSingleTx, bool requiresApprovedRecipients) external",
  "event PolicyViolation(address indexed business, address indexed recipient, uint256 amount, string reason)",
  "event SpendRecorded(address indexed business, uint256 amount, uint256 dailyTotal, uint256 dailyLimit)",
]);

export const PAYMENT_ORCHESTRATOR_ABI = parseAbi([
  "function executeDirectPayment(bytes32 paymentId, address business, address recipient, uint256 amount, address token, bytes32 agentId, bytes32 stateHash) returns (bool success)",
  "function executeFXPayment(bytes32 paymentId, address business, address recipient, uint256 amountIn, address tokenIn, address tokenOut, address exchangeProvider, bytes32 exchangeId, uint256 minAmountOut, bytes32 agentId, bytes32 stateHash) returns (uint256 amountOut)",
  "function quoteFX(address exchangeProvider, bytes32 exchangeId, address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256 amountOut)",
  "function getPayment(bytes32 paymentId) view returns ((bytes32 id, address business, address recipient, uint256 amountIn, address tokenIn, uint256 amountOut, address tokenOut, uint8 status, uint256 timestamp, uint256 attestationId, bytes32 agentId))",
  "function totalPaymentsExecuted() view returns (uint256)",
  "function totalVolumeUSD() view returns (uint256)",
  "event PaymentExecuted(bytes32 indexed paymentId, uint256 amountOut, address tokenOut, bytes32 agentId)",
  "event PaymentFailed(bytes32 indexed paymentId, string reason)",
]);

export const ATTESTATION_LOGGER_ABI = parseAbi([
  "function logPayment(bytes32 paymentId, address business, address recipient, uint256 amountIn, address tokenIn, uint256 amountOut, address tokenOut, bytes32 agentId, bytes32 stateHash) returns (uint256 id)",
  "function logAgentAction(bytes32 paymentId, bytes32 agentId, string action, bytes32 inputHash, bytes32 outputHash, bool success) returns (uint256 id)",
  "function getPaymentAttestation(bytes32 paymentId) view returns ((uint256 id, bytes32 paymentId, address business, address recipient, uint256 amountIn, address tokenIn, uint256 amountOut, address tokenOut, bytes32 agentId, uint256 timestamp, bytes32 stateHash))",
  "function attestationCount() view returns (uint256)",
  "event PaymentAttested(uint256 indexed id, bytes32 indexed paymentId, address indexed business, address recipient, uint256 amountIn, address tokenIn, uint256 amountOut, address tokenOut, bytes32 agentId)",
]);

export const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",  // ← ADD THIS
]);
// ─────────────────────────────────────────────────────────────────────────────
// Client factory
// ─────────────────────────────────────────────────────────────────────────────

export function getPublicClient(chainId: number): PublicClient {
  const addrs = getAddresses(chainId);
  const chain = chainId === CHAIN_IDS.CELO ? celo : celoSepolia;
  return createPublicClient({
    chain,
    transport: http(addrs.rpc),
  }) as unknown as PublicClient;
}

export function getWalletClient(privateKey: `0x${string}`, chainId: number) {
  const chain = chainId === CHAIN_IDS.CELO ? celo : celoSepolia;
  const addrs = getAddresses(chainId);
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain,
    transport: http(addrs.rpc),
  }).extend(publicActions);
}

// ─────────────────────────────────────────────────────────────────────────────
// CeloContractClient — agent's interface to the deployed contracts
// ─────────────────────────────────────────────────────────────────────────────

export class CeloContractClient {
  public readonly chainId: number;
  public readonly publicClient: PublicClient;
  private walletClient: ReturnType<typeof getWalletClient> | null = null;
  private readonly addrs: ReturnType<typeof getAddresses>;

  // Deployed contract addresses — loaded from deployment artifact
  private _policyEngine?: `0x${string}`;
  private _orchestrator?: `0x${string}`;
  private _attestationLogger?: `0x${string}`;

  constructor(chainId: number, privateKey?: `0x${string}`) {
    this.chainId = chainId;
    this.addrs = getAddresses(chainId);
    this.publicClient = getPublicClient(chainId);
    if (privateKey) {
      this.walletClient = getWalletClient(privateKey, chainId);
    }
  }

  setContractAddresses(addresses: {
    policyEngine: `0x${string}`;
    orchestrator: `0x${string}`;
    attestationLogger: `0x${string}`;
  }) {
    this._policyEngine = addresses.policyEngine;
    this._orchestrator = addresses.orchestrator;
    this._attestationLogger = addresses.attestationLogger;
  }

  private requireWallet() {
    if (!this.walletClient) throw new Error("CeloContractClient: no wallet — provide a private key");
    return this.walletClient;
  }

  private requireContracts() {
    if (!this._policyEngine || !this._orchestrator || !this._attestationLogger) {
      throw new Error("CeloContractClient: call setContractAddresses first");
    }
  }

  // ── Read functions ──────────────────────────────────────────────────────────

  async simulatePolicyCheck(business: `0x${string}`, recipient: `0x${string}`, amount: bigint) {
    this.requireContracts();
    return this.publicClient.readContract({
      address: this._policyEngine!,
      abi: POLICY_ENGINE_ABI,
      functionName: "simulateCheck",
      args: [business, recipient, amount],
    });
  }

  async getPolicy(business: `0x${string}`) {
    this.requireContracts();
    return this.publicClient.readContract({
      address: this._policyEngine!,
      abi: POLICY_ENGINE_ABI,
      functionName: "getPolicy",
      args: [business],
    });
  }

  async getPayment(paymentId: `0x${string}`) {
    this.requireContracts();
    return this.publicClient.readContract({
      address: this._orchestrator!,
      abi: PAYMENT_ORCHESTRATOR_ABI,
      functionName: "getPayment",
      args: [paymentId],
    });
  }

  async getBalance(tokenAddress: `0x${string}`, account: `0x${string}`): Promise<bigint> {
    return this.publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account],
    });
  }

  async getAllowance(tokenAddress: `0x${string}`, owner: `0x${string}`, spender: `0x${string}`): Promise<bigint> {
    return this.publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, spender],
    });
  }

  async getStats(): Promise<{ totalPayments: bigint; totalVolumeUSD: bigint }> {
    this.requireContracts();
    const [totalPayments, totalVolumeUSD] = await Promise.all([
      this.publicClient.readContract({
        address: this._orchestrator!,
        abi: PAYMENT_ORCHESTRATOR_ABI,
        functionName: "totalPaymentsExecuted",
      }),
      this.publicClient.readContract({
        address: this._orchestrator!,
        abi: PAYMENT_ORCHESTRATOR_ABI,
        functionName: "totalVolumeUSD",
      }),
    ]);
    return { totalPayments: totalPayments as bigint, totalVolumeUSD: totalVolumeUSD as bigint };
  }

  // ── Write functions ─────────────────────────────────────────────────────────

  async approveToken(
    tokenAddress: `0x${string}`,
    spender: `0x${string}`,
    amount: bigint
  ): Promise<Hash> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
    });
    return hash;
  }

  async executeDirectPayment(params: {
    paymentId: `0x${string}`;
    business: `0x${string}`;
    recipient: `0x${string}`;
    amount: bigint;
    token: `0x${string}`;
    agentId: `0x${string}`;
    stateHash: `0x${string}`;
  }): Promise<Hash> {
    const wallet = this.requireWallet();
    this.requireContracts();

    return wallet.writeContract({
      address: this._orchestrator!,
      abi: PAYMENT_ORCHESTRATOR_ABI,
      functionName: "executeDirectPayment",
      args: [
        params.paymentId,
        params.business,
        params.recipient,
        params.amount,
        params.token,
        params.agentId,
        params.stateHash,
      ],
    });
  }

  async executeFXPayment(params: {
    paymentId: `0x${string}`;
    business: `0x${string}`;
    recipient: `0x${string}`;
    amountIn: bigint;
    tokenIn: `0x${string}`;
    tokenOut: `0x${string}`;
    exchangeProvider: `0x${string}`;
    exchangeId: `0x${string}`;
    minAmountOut: bigint;
    agentId: `0x${string}`;
    stateHash: `0x${string}`;
  }): Promise<Hash> {
    const wallet = this.requireWallet();
    this.requireContracts();

    return wallet.writeContract({
      address: this._orchestrator!,
      abi: PAYMENT_ORCHESTRATOR_ABI,
      functionName: "executeFXPayment",
      args: [
        params.paymentId,
        params.business,
        params.recipient,
        params.amountIn,
        params.tokenIn,
        params.tokenOut,
        params.exchangeProvider,
        params.exchangeId,
        params.minAmountOut,
        params.agentId,
        params.stateHash,
      ],
    });
  }

  async logAgentAction(params: {
    paymentId: `0x${string}`;
    agentId: `0x${string}`;
    action: string;
    inputHash: `0x${string}`;
    outputHash: `0x${string}`;
    success: boolean;
  }): Promise<Hash> {
    const wallet = this.requireWallet();
    this.requireContracts();

    return wallet.writeContract({
      address: this._attestationLogger!,
      abi: ATTESTATION_LOGGER_ABI,
      functionName: "logAgentAction",
      args: [
        params.paymentId,
        params.agentId,
        params.action,
        params.inputHash,
        params.outputHash,
        params.success,
      ],
    });
  }

  async waitForReceipt(hash: Hash, timeout = 60_000): Promise<TransactionReceipt> {
    return this.publicClient.waitForTransactionReceipt({
      hash,
      timeout,
      pollingInterval: 2_000,
    });
  }

  get explorerUrl(): string {
    return this.addrs.explorer;
  }

  txUrl(hash: Hash): string {
    return `${this.addrs.explorer}/tx/${hash}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton factory — one client per agent wallet
// ─────────────────────────────────────────────────────────────────────────────

const _clients = new Map<string, CeloContractClient>();

export function getCeloClient(agentKey: string, privateKey?: `0x${string}`): CeloContractClient {
  if (!_clients.has(agentKey)) {
    const chainId = parseInt(process.env.CHAIN_ID ?? "11142220");
    const client = new CeloContractClient(chainId, privateKey);

    // Load contract addresses from deployment artifact
    try {
      const artifactName = chainId === CHAIN_IDS.CELO ? "celo" : "celo-sepolia";
      const deployment = require(`../../contracts/deployments/${artifactName}.json`);
      client.setContractAddresses({
        policyEngine: deployment.contracts.policyEngine,
        orchestrator: deployment.contracts.paymentOrchestrator,
        attestationLogger: deployment.contracts.attestationLogger,
      });
    } catch {
      console.warn(`[CeloContractClient] No deployment artifact found for ${agentKey} — run deploy.ts first`);
    }

    _clients.set(agentKey, client);
  }
  return _clients.get(agentKey)!;
}