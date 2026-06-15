// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title FeeVault
/// @notice Holds a cUSD reserve for funding agent wallets with gas allowances.
/// @dev Celo natively supports gas payment in cUSD via the feeCurrency mechanism.
///      This vault distributes cUSD top-ups to agent wallets so they can operate
///      without holding native CELO. Owner calls topUpAgent() periodically or at deploy.
contract FeeVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable cUSD;

    uint256 public defaultAllowance = 2 * 1e18; // 2 cUSD default per agent top-up

    struct AgentRecord {
        bool registered;
        uint256 totalFunded;
        uint256 lastFundedAt;
    }

    mapping(address => AgentRecord) public agents;
    address[] public registeredAgents;

    event AgentRegistered(address indexed agent);
    event AgentFunded(address indexed agent, uint256 amount, uint256 totalFunded);
    event Deposited(address indexed depositor, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event DefaultAllowanceUpdated(uint256 newAmount);

    constructor(address _cUSD) Ownable(msg.sender) {
        require(_cUSD != address(0), "FeeVault: zero cUSD address");
        cUSD = IERC20(_cUSD);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Funding
    // ─────────────────────────────────────────────────────────────────────────

    function deposit(uint256 amount) external {
        cUSD.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount, address to) external onlyOwner {
        cUSD.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    function setDefaultAllowance(uint256 amount) external onlyOwner {
        require(amount > 0, "FeeVault: zero allowance");
        defaultAllowance = amount;
        emit DefaultAllowanceUpdated(amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Agent management
    // ─────────────────────────────────────────────────────────────────────────

    function registerAgent(address agent) external onlyOwner {
        require(agent != address(0), "FeeVault: zero agent");
        require(!agents[agent].registered, "FeeVault: already registered");
        agents[agent].registered = true;
        registeredAgents.push(agent);
        emit AgentRegistered(agent);
    }

    function topUpAgent(address agent, uint256 amount) external onlyOwner {
        require(agents[agent].registered, "FeeVault: agent not registered");
        require(cUSD.balanceOf(address(this)) >= amount, "FeeVault: insufficient balance");
        cUSD.safeTransfer(agent, amount);
        agents[agent].totalFunded += amount;
        agents[agent].lastFundedAt = block.timestamp;
        emit AgentFunded(agent, amount, agents[agent].totalFunded);
    }

    /// @notice Top up all registered agents with the default allowance
    function topUpAllAgents() external onlyOwner {
        uint256 total = registeredAgents.length * defaultAllowance;
        require(cUSD.balanceOf(address(this)) >= total, "FeeVault: insufficient balance for all agents");
        for (uint256 i = 0; i < registeredAgents.length; i++) {
            address agent = registeredAgents[i];
            cUSD.safeTransfer(agent, defaultAllowance);
            agents[agent].totalFunded += defaultAllowance;
            agents[agent].lastFundedAt = block.timestamp;
            emit AgentFunded(agent, defaultAllowance, agents[agent].totalFunded);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Read
    // ─────────────────────────────────────────────────────────────────────────

    function vaultBalance() external view returns (uint256) {
        return cUSD.balanceOf(address(this));
    }

    function getRegisteredAgents() external view returns (address[] memory) {
        return registeredAgents;
    }
}
