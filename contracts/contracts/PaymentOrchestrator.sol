// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IMentoBroker.sol";

interface IPolicyEngine {
    function checkAndRecordSpend(
        address business,
        address recipient,
        uint256 amount
    ) external returns (bool approved, string memory reason);
}

interface IAttestationLogger {
    function logPayment(
        bytes32 paymentId,
        address business,
        address recipient,
        uint256 amountIn,
        address tokenIn,
        uint256 amountOut,
        address tokenOut,
        bytes32 agentId,
        bytes32 stateHash
    ) external returns (uint256 id);

    function logAgentAction(
        bytes32 paymentId,
        bytes32 agentId,
        string calldata action,
        bytes32 inputHash,
        bytes32 outputHash,
        bool success
    ) external returns (uint256 id);
}

/// @title PaymentOrchestrator
/// @notice Routes payments with optional Mento FX swaps, enforcing PolicyEngine rules.
/// @dev Only authorized agents (ERC-8004 registered wallets) can call execute functions.
///      All value flows are atomic — no partial settlement is possible.
contract PaymentOrchestrator is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    enum PaymentStatus {
        Pending,
        Executed,
        Failed,
        Refunded
    }

    struct PaymentRecord {
        bytes32 id;
        address business;
        address recipient;
        uint256 amountIn;
        address tokenIn;
        uint256 amountOut;
        address tokenOut;
        PaymentStatus status;
        uint256 timestamp;
        uint256 attestationId;
        bytes32 agentId;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    IPolicyEngine public policyEngine;
    IAttestationLogger public attestationLogger;
    IMentoBroker public mentoBroker;

    mapping(bytes32 => PaymentRecord) public payments;
    mapping(address => bool) public authorizedAgents;

    uint256 public totalPaymentsExecuted;
    uint256 public totalVolumeUSD; // cumulative volume (18 dec)

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event AgentAuthorized(address indexed agent, bytes32 agentId);
    event AgentRevoked(address indexed agent);
    event PaymentInitiated(bytes32 indexed paymentId, address indexed business, address indexed recipient, uint256 amountIn, address tokenIn);
    event PaymentExecuted(bytes32 indexed paymentId, uint256 amountOut, address tokenOut, bytes32 agentId);
    event PaymentFailed(bytes32 indexed paymentId, string reason);
    event PolicyEngineUpdated(address indexed newEngine);
    event AttestationLoggerUpdated(address indexed newLogger);
    event BrokerUpdated(address indexed newBroker);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(
        address _policyEngine,
        address _mentoBroker,
        address _attestationLogger
    ) Ownable(msg.sender) {
        require(_policyEngine != address(0), "PaymentOrchestrator: zero policyEngine");
        require(_mentoBroker != address(0), "PaymentOrchestrator: zero broker");
        policyEngine = IPolicyEngine(_policyEngine);
        mentoBroker = IMentoBroker(_mentoBroker);
        if (_attestationLogger != address(0)) {
            attestationLogger = IAttestationLogger(_attestationLogger);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function authorizeAgent(address agent, bytes32 agentId) external onlyOwner {
        authorizedAgents[agent] = true;
        emit AgentAuthorized(agent, agentId);
    }

    function revokeAgent(address agent) external onlyOwner {
        authorizedAgents[agent] = false;
        emit AgentRevoked(agent);
    }

    function setPolicyEngine(address _policyEngine) external onlyOwner {
        policyEngine = IPolicyEngine(_policyEngine);
        emit PolicyEngineUpdated(_policyEngine);
    }

    function setAttestationLogger(address _logger) external onlyOwner {
        attestationLogger = IAttestationLogger(_logger);
        emit AttestationLoggerUpdated(_logger);
    }

    function setBroker(address _broker) external onlyOwner {
        mentoBroker = IMentoBroker(_broker);
        emit BrokerUpdated(_broker);
    }

    modifier onlyAgent() {
        require(authorizedAgents[msg.sender], "PaymentOrchestrator: caller is not authorized agent");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core execute — same-currency (no FX)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Execute a direct stablecoin transfer without currency conversion.
    /// @dev Business must have pre-approved this contract for amountIn of tokenIn.
    /// @param paymentId Unique payment identifier (keccak256 of off-chain UUID)
    /// @param business The paying business address
    /// @param recipient The payment recipient
    /// @param amount The payment amount (18 decimals)
    /// @param token The stablecoin address (e.g. cUSD)
    /// @param agentId ERC-8004 agent token ID executing this payment (padded to bytes32)
    /// @param stateHash keccak256 of the full off-chain PaymentState for attestation
    function executeDirectPayment(
        bytes32 paymentId,
        address business,
        address recipient,
        uint256 amount,
        address token,
        bytes32 agentId,
        bytes32 stateHash
    ) external onlyAgent nonReentrant returns (bool success) {
        require(payments[paymentId].timestamp == 0, "PaymentOrchestrator: duplicate paymentId");
        require(recipient != address(0), "PaymentOrchestrator: zero recipient");
        require(amount > 0, "PaymentOrchestrator: zero amount");

        emit PaymentInitiated(paymentId, business, recipient, amount, token);

        // Policy check — state-modifying, records spend
        (bool approved, string memory reason) = policyEngine.checkAndRecordSpend(business, recipient, amount);
        if (!approved) {
            _recordFailed(paymentId, business, recipient, amount, token, agentId, reason);
            return false;
        }

        // Pull funds from business wallet
        IERC20(token).safeTransferFrom(business, address(this), amount);

        // Forward to recipient
        IERC20(token).safeTransfer(recipient, amount);

        // Record
        _recordSuccess(paymentId, business, recipient, amount, token, amount, token, agentId, stateHash);
        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core execute — FX swap via Mento Broker
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Execute a payment with Mento FX conversion (e.g. cUSD → cKES).
    /// @dev Business pre-approves amountIn of tokenIn. Recipient receives tokenOut.
    ///      All params except agentId/stateHash come from FX Router Agent quote.
    /// @param paymentId Unique payment identifier
    /// @param business The paying business address
    /// @param recipient The payment recipient
    /// @param amountIn Input amount (18 decimals)
    /// @param tokenIn Input stablecoin (e.g. cUSD)
    /// @param tokenOut Output stablecoin (e.g. cKES)
    /// @param exchangeProvider Mento exchange provider address (BiPoolManager)
    /// @param exchangeId Mento exchange pair ID for this tokenIn/tokenOut combo
    /// @param minAmountOut Minimum acceptable output — slippage protection
    /// @param agentId ERC-8004 agent token ID (padded to bytes32)
    /// @param stateHash keccak256 of full off-chain PaymentState
    /// @return amountOut Actual amount of tokenOut delivered to recipient
    function executeFXPayment(
        bytes32 paymentId,
        address business,
        address recipient,
        uint256 amountIn,
        address tokenIn,
        address tokenOut,
        address exchangeProvider,
        bytes32 exchangeId,
        uint256 minAmountOut,
        bytes32 agentId,
        bytes32 stateHash
    ) external onlyAgent nonReentrant returns (uint256 amountOut) {
        require(payments[paymentId].timestamp == 0, "PaymentOrchestrator: duplicate paymentId");
        require(recipient != address(0), "PaymentOrchestrator: zero recipient");
        require(amountIn > 0, "PaymentOrchestrator: zero amountIn");
        require(tokenIn != tokenOut, "PaymentOrchestrator: use executeDirectPayment for same-token");

        emit PaymentInitiated(paymentId, business, recipient, amountIn, tokenIn);

        // Policy check on the input amount
        (bool approved, string memory reason) = policyEngine.checkAndRecordSpend(business, recipient, amountIn);
        require(approved, reason);

        // Pull tokenIn from business
        IERC20(tokenIn).safeTransferFrom(business, address(this), amountIn);

        // Approve broker to spend tokenIn
        IERC20(tokenIn).forceApprove(address(mentoBroker), amountIn);

        // Execute FX swap — Mento Broker atomically mints/burns
        amountOut = mentoBroker.swapIn(
            exchangeProvider,
            exchangeId,
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut
        );

        // Send tokenOut directly to recipient
        IERC20(tokenOut).safeTransfer(recipient, amountOut);

        // Record and attest
        _recordSuccess(paymentId, business, recipient, amountIn, tokenIn, amountOut, tokenOut, agentId, stateHash);
        return amountOut;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _recordSuccess(
        bytes32 paymentId,
        address business,
        address recipient,
        uint256 amountIn,
        address tokenIn,
        uint256 amountOut,
        address tokenOut,
        bytes32 agentId,
        bytes32 stateHash
    ) internal {
        payments[paymentId] = PaymentRecord({
            id: paymentId,
            business: business,
            recipient: recipient,
            amountIn: amountIn,
            tokenIn: tokenIn,
            amountOut: amountOut,
            tokenOut: tokenOut,
            status: PaymentStatus.Executed,
            timestamp: block.timestamp,
            attestationId: 0,
            agentId: agentId
        });

        totalPaymentsExecuted++;
        totalVolumeUSD += amountIn;

        if (address(attestationLogger) != address(0)) {
            uint256 attId = attestationLogger.logPayment(
                paymentId, business, recipient,
                amountIn, tokenIn, amountOut, tokenOut,
                agentId, stateHash
            );
            payments[paymentId].attestationId = attId;
        }

        emit PaymentExecuted(paymentId, amountOut, tokenOut, agentId);
    }

    function _recordFailed(
        bytes32 paymentId,
        address business,
        address recipient,
        uint256 amount,
        address token,
        bytes32 agentId,
        string memory reason
    ) internal {
        payments[paymentId] = PaymentRecord({
            id: paymentId,
            business: business,
            recipient: recipient,
            amountIn: amount,
            tokenIn: token,
            amountOut: 0,
            tokenOut: token,
            status: PaymentStatus.Failed,
            timestamp: block.timestamp,
            attestationId: 0,
            agentId: agentId
        });
        emit PaymentFailed(paymentId, reason);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Read helpers
    // ─────────────────────────────────────────────────────────────────────────

    function getPayment(bytes32 paymentId)
        external
        view
        returns (PaymentRecord memory)
    {
        return payments[paymentId];
    }

    /// @notice Quote a Mento FX swap without executing it (for agent pre-flight)
    function quoteFX(
        address exchangeProvider,
        bytes32 exchangeId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 amountOut) {
        return mentoBroker.getAmountOut(exchangeProvider, exchangeId, tokenIn, tokenOut, amountIn);
    }
}
