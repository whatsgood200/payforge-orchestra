// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title PolicyEngine
/// @notice Onchain enforcement of business payment policies.
/// @dev Called by the PaymentOrchestrator before executing any payment.
///      Hard rules here cannot be bypassed by the agent layer.
contract PolicyEngine is Ownable {
    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    struct Policy {
        uint256 dailyLimit;      // max cumulative spend per 24h window (18 decimals)
        uint256 maxSingleTx;     // max single transaction amount (18 decimals)
        uint256 minSingleTx;     // min single transaction amount (18 decimals, 0 = no min)
        uint256 dailySpent;      // cumulative spend in current day
        uint256 lastResetDay;    // unix day of last reset (block.timestamp / 86400)
        bool active;
        bool requiresApprovedRecipients; // if true, recipient must be in whitelist
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Policies per business wallet address
    mapping(address => Policy) public policies;

    /// @notice Approved recipient whitelist per business
    mapping(address => mapping(address => bool)) public approvedRecipients;

    /// @notice Addresses authorised to call checkAndRecordSpend (i.e. PaymentOrchestrator)
    mapping(address => bool) public authorizedCallers;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event PolicyConfigured(
        address indexed business,
        uint256 dailyLimit,
        uint256 maxSingleTx,
        uint256 minSingleTx,
        bool requiresApprovedRecipients
    );
    event PolicyActivated(address indexed business);
    event PolicyDeactivated(address indexed business);
    event RecipientApproved(address indexed business, address indexed recipient);
    event RecipientRevoked(address indexed business, address indexed recipient);
    event PolicyViolation(address indexed business, address indexed recipient, uint256 amount, string reason);
    event SpendRecorded(address indexed business, uint256 amount, uint256 dailyTotal, uint256 dailyLimit);
    event CallerAuthorized(address indexed caller);

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyAuthorizedCaller() {
        require(authorizedCallers[msg.sender] || msg.sender == owner(), "PolicyEngine: not authorized");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function authorizeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = true;
        emit CallerAuthorized(caller);
    }

    function revokeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Business configuration
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Configure a spending policy for a business address.
    /// @dev Can be called by the business itself or the contract owner.
    function configurePolicy(
        address business,
        uint256 dailyLimit,
        uint256 maxSingleTx,
        uint256 minSingleTx,
        bool requiresApprovedRecipients
    ) external {
        require(
            msg.sender == business || msg.sender == owner(),
            "PolicyEngine: not authorized to configure"
        );
        require(dailyLimit > 0, "PolicyEngine: dailyLimit must be > 0");
        require(maxSingleTx > 0, "PolicyEngine: maxSingleTx must be > 0");
        require(maxSingleTx <= dailyLimit, "PolicyEngine: maxSingleTx cannot exceed dailyLimit");

        Policy storage p = policies[business];
        p.dailyLimit = dailyLimit;
        p.maxSingleTx = maxSingleTx;
        p.minSingleTx = minSingleTx;
        p.active = true;
        p.requiresApprovedRecipients = requiresApprovedRecipients;

        emit PolicyConfigured(business, dailyLimit, maxSingleTx, minSingleTx, requiresApprovedRecipients);
        emit PolicyActivated(business);
    }

    function deactivatePolicy(address business) external {
        require(msg.sender == business || msg.sender == owner(), "PolicyEngine: not authorized");
        policies[business].active = false;
        emit PolicyDeactivated(business);
    }

    function activatePolicy(address business) external {
        require(msg.sender == business || msg.sender == owner(), "PolicyEngine: not authorized");
        require(policies[business].dailyLimit > 0, "PolicyEngine: policy not configured");
        policies[business].active = true;
        emit PolicyActivated(business);
    }

    function addApprovedRecipient(address business, address recipient) external {
        require(msg.sender == business || msg.sender == owner(), "PolicyEngine: not authorized");
        approvedRecipients[business][recipient] = true;
        emit RecipientApproved(business, recipient);
    }

    function removeApprovedRecipient(address business, address recipient) external {
        require(msg.sender == business || msg.sender == owner(), "PolicyEngine: not authorized");
        approvedRecipients[business][recipient] = false;
        emit RecipientRevoked(business, recipient);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core check — called by PaymentOrchestrator
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Check policy rules AND record the spend if approved.
    /// @dev State-modifying: updates dailySpent on approval.
    ///      Only callable by authorized callers (PaymentOrchestrator).
    /// @param business The business initiating the payment
    /// @param recipient The payment recipient
    /// @param amount The payment amount in stablecoin units (18 decimals)
    /// @return approved Whether the payment passes all policy rules
    /// @return reason Human-readable explanation
    function checkAndRecordSpend(
        address business,
        address recipient,
        uint256 amount
    ) external onlyAuthorizedCaller returns (bool approved, string memory reason) {
        Policy storage p = policies[business];

        if (!p.active) {
            emit PolicyViolation(business, recipient, amount, "No active policy");
            return (false, "No active policy");
        }

        // Roll over daily counter if we're in a new day
        uint256 today = block.timestamp / 86400;
        if (today > p.lastResetDay) {
            p.dailySpent = 0;
            p.lastResetDay = today;
        }

        // Minimum tx check
        if (p.minSingleTx > 0 && amount < p.minSingleTx) {
            emit PolicyViolation(business, recipient, amount, "Below minimum tx amount");
            return (false, "Below minimum tx amount");
        }

        // Single tx cap
        if (amount > p.maxSingleTx) {
            emit PolicyViolation(business, recipient, amount, "Exceeds per-tx limit");
            return (false, "Exceeds per-tx limit");
        }

        // Daily cumulative cap
        if (p.dailySpent + amount > p.dailyLimit) {
            emit PolicyViolation(business, recipient, amount, "Exceeds daily limit");
            return (false, "Exceeds daily limit");
        }

        // Recipient whitelist check
        if (p.requiresApprovedRecipients && !approvedRecipients[business][recipient]) {
            emit PolicyViolation(business, recipient, amount, "Recipient not approved");
            return (false, "Recipient not approved");
        }

        // All checks passed — record the spend
        p.dailySpent += amount;

        emit SpendRecorded(business, amount, p.dailySpent, p.dailyLimit);
        return (true, "Approved");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Read-only helpers (used by the dashboard and Policy Agent)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice View-only policy check without modifying state — for agent pre-flight
    function simulateCheck(
        address business,
        address recipient,
        uint256 amount
    ) external view returns (bool approved, string memory reason, uint256 remainingDailyAllowance) {
        Policy storage p = policies[business];

        if (!p.active) return (false, "No active policy", 0);

        uint256 today = block.timestamp / 86400;
        uint256 currentDailySpent = (today > p.lastResetDay) ? 0 : p.dailySpent;

        if (p.minSingleTx > 0 && amount < p.minSingleTx)
            return (false, "Below minimum tx amount", p.dailyLimit - currentDailySpent);

        if (amount > p.maxSingleTx)
            return (false, "Exceeds per-tx limit", p.dailyLimit - currentDailySpent);

        if (currentDailySpent + amount > p.dailyLimit)
            return (false, "Exceeds daily limit", p.dailyLimit - currentDailySpent);

        if (p.requiresApprovedRecipients && !approvedRecipients[business][recipient])
            return (false, "Recipient not approved", p.dailyLimit - currentDailySpent);

        return (true, "Approved", p.dailyLimit - currentDailySpent - amount);
    }

    function getPolicy(address business)
        external
        view
        returns (
            uint256 dailyLimit,
            uint256 maxSingleTx,
            uint256 minSingleTx,
            uint256 dailySpent,
            bool active,
            bool requiresApprovedRecipients,
            uint256 remainingToday
        )
    {
        Policy storage p = policies[business];
        uint256 today = block.timestamp / 86400;
        uint256 currentSpent = (today > p.lastResetDay) ? 0 : p.dailySpent;
        uint256 remaining = p.dailyLimit > currentSpent ? p.dailyLimit - currentSpent : 0;

        return (
            p.dailyLimit,
            p.maxSingleTx,
            p.minSingleTx,
            currentSpent,
            p.active,
            p.requiresApprovedRecipients,
            remaining
        );
    }
}
