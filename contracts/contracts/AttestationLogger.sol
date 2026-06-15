// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AttestationLogger
/// @notice Immutable onchain log of every payment action taken by PayForge agents.
/// @dev Each record is write-once and serves as an audit trail. The Reconciliation
///      Agent calls logPayment after every settlement. Records can be queried by
///      the dashboard and verified by judges on Celoscan.
contract AttestationLogger is Ownable {
    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    struct PaymentAttestation {
        uint256 id;
        bytes32 paymentId;      // UUID from off-chain state (keccak hash of uuid)
        address business;
        address recipient;
        uint256 amountIn;
        address tokenIn;
        uint256 amountOut;
        address tokenOut;
        bytes32 agentId;        // ERC-8004 token ID (padded to bytes32) of executing agent
        uint256 timestamp;
        bytes32 stateHash;      // keccak256 of the full off-chain PaymentState JSON
    }

    struct AgentActionLog {
        uint256 id;
        bytes32 paymentId;
        bytes32 agentId;
        string action;          // "fx_quote", "policy_check", "execute_tx", "reconcile"
        bytes32 inputHash;      // keccak256 of action input data
        bytes32 outputHash;     // keccak256 of action output data
        bool success;
        uint256 timestamp;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    mapping(uint256 => PaymentAttestation) public attestations;
    mapping(uint256 => AgentActionLog) public actionLogs;
    mapping(bytes32 => uint256) public paymentIdToAttestation; // paymentId → attestation id
    mapping(bytes32 => uint256[]) public paymentIdToActions;   // paymentId → action log ids

    uint256 public attestationCount;
    uint256 public actionLogCount;

    mapping(address => bool) public authorizedLoggers;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event PaymentAttested(
        uint256 indexed id,
        bytes32 indexed paymentId,
        address indexed business,
        address recipient,
        uint256 amountIn,
        address tokenIn,
        uint256 amountOut,
        address tokenOut,
        bytes32 agentId
    );

    event AgentActionLogged(
        uint256 indexed id,
        bytes32 indexed paymentId,
        bytes32 indexed agentId,
        string action,
        bool success
    );

    event LoggerAuthorized(address indexed logger);
    event LoggerRevoked(address indexed logger);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function authorizeLogger(address logger) external onlyOwner {
        authorizedLoggers[logger] = true;
        emit LoggerAuthorized(logger);
    }

    function revokeLogger(address logger) external onlyOwner {
        authorizedLoggers[logger] = false;
        emit LoggerRevoked(logger);
    }

    modifier onlyAuthorizedLogger() {
        require(
            authorizedLoggers[msg.sender] || msg.sender == owner(),
            "AttestationLogger: not authorized"
        );
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Write — called by PaymentOrchestrator and Reconciliation Agent
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Log a completed payment settlement
    /// @return id The attestation ID (sequential, starts at 1)
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
    ) external onlyAuthorizedLogger returns (uint256 id) {
        require(paymentIdToAttestation[paymentId] == 0, "AttestationLogger: already attested");

        id = ++attestationCount;

        attestations[id] = PaymentAttestation({
            id: id,
            paymentId: paymentId,
            business: business,
            recipient: recipient,
            amountIn: amountIn,
            tokenIn: tokenIn,
            amountOut: amountOut,
            tokenOut: tokenOut,
            agentId: agentId,
            timestamp: block.timestamp,
            stateHash: stateHash
        });

        paymentIdToAttestation[paymentId] = id;

        emit PaymentAttested(
            id, paymentId, business, recipient,
            amountIn, tokenIn, amountOut, tokenOut, agentId
        );
    }

    /// @notice Log an individual agent reasoning step
    /// @dev Called by agents for each major decision to ensure full auditability
    function logAgentAction(
        bytes32 paymentId,
        bytes32 agentId,
        string calldata action,
        bytes32 inputHash,
        bytes32 outputHash,
        bool success
    ) external onlyAuthorizedLogger returns (uint256 id) {
        id = ++actionLogCount;

        actionLogs[id] = AgentActionLog({
            id: id,
            paymentId: paymentId,
            agentId: agentId,
            action: action,
            inputHash: inputHash,
            outputHash: outputHash,
            success: success,
            timestamp: block.timestamp
        });

        paymentIdToActions[paymentId].push(id);

        emit AgentActionLogged(id, paymentId, agentId, action, success);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Read
    // ─────────────────────────────────────────────────────────────────────────

    function getAttestation(uint256 id)
        external
        view
        returns (PaymentAttestation memory)
    {
        return attestations[id];
    }

    function getPaymentAttestation(bytes32 paymentId)
        external
        view
        returns (PaymentAttestation memory)
    {
        return attestations[paymentIdToAttestation[paymentId]];
    }

    function getPaymentActions(bytes32 paymentId)
        external
        view
        returns (AgentActionLog[] memory logs)
    {
        uint256[] memory ids = paymentIdToActions[paymentId];
        logs = new AgentActionLog[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            logs[i] = actionLogs[ids[i]];
        }
    }

    function getRecentAttestations(uint256 count)
        external
        view
        returns (PaymentAttestation[] memory recent)
    {
        uint256 total = attestationCount;
        uint256 resultCount = count > total ? total : count;
        recent = new PaymentAttestation[](resultCount);
        for (uint256 i = 0; i < resultCount; i++) {
            recent[i] = attestations[total - i];
        }
    }
}
