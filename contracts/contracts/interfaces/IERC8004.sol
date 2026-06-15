// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC8004Identity
/// @notice Interface for the ERC-8004 IdentityRegistry (ERC-721 based agent registry)
/// @dev Testnet: 0x8004A818BFB912233c491871b3d84c89A494BD9e
/// @dev Mainnet: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
interface IERC8004Identity {
    /// @notice Register a new agent, minting an ERC-721 NFT
    /// @param agentURI URI pointing to the agent registration file (JSON, typically IPFS)
    /// @return agentId The token ID of the newly registered agent
    function register(string calldata agentURI) external returns (uint256 agentId);

    /// @notice Update the URI of an existing agent registration
    /// @param agentId The token ID of the agent
    /// @param agentURI The new URI for the agent registration file
    function setAgentURI(uint256 agentId, string calldata agentURI) external;

    /// @notice Set the verified receiving wallet for an agent (requires EIP-712 proof)
    /// @param agentId The token ID of the agent
    /// @param wallet The new wallet address
    /// @param deadline Signature expiry timestamp
    /// @param v ECDSA v component
    /// @param r ECDSA r component
    /// @param s ECDSA s component
    function setAgentWallet(
        uint256 agentId,
        address wallet,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /// @notice Get the owner of an agent NFT
    /// @param agentId The token ID of the agent
    /// @return owner The address that owns this agent NFT
    function ownerOf(uint256 agentId) external view returns (address owner);

    /// @notice Get the URI of an agent registration file
    /// @param agentId The token ID of the agent
    /// @return uri The URI pointing to the agent registration JSON
    function tokenURI(uint256 agentId) external view returns (string memory uri);

    /// @notice Total number of registered agents
    function totalSupply() external view returns (uint256);

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string agentURI);
    event AgentURIUpdated(uint256 indexed agentId, string agentURI);
    event AgentWalletUpdated(uint256 indexed agentId, address wallet);
}

/// @title IERC8004Reputation
/// @notice Interface for the ERC-8004 ReputationRegistry
/// @dev Testnet: 0x8004B663056A597Dffe9eCcC1965A193B7388713
/// @dev Mainnet: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
interface IERC8004Reputation {
    struct Feedback {
        address clientAddress;
        int128 value;          // fixed-point rating
        uint8 valueDecimals;   // 0-18
        string tag1;
        string tag2;
        string endpointURI;
        string fileURI;
        bytes32 fileHash;
        uint256 timestamp;
    }

    /// @notice Submit feedback for an agent
    /// @param agentId The token ID of the agent being rated
    /// @param value The rating value (fixed-point, scaled by valueDecimals)
    /// @param valueDecimals Number of decimals for the value
    /// @param tag1 Optional category tag
    /// @param tag2 Optional secondary tag
    /// @param endpointURI Optional endpoint URI this feedback relates to
    /// @param fileURI Optional off-chain evidence file URI
    /// @param fileHash Optional keccak256 hash of the evidence file
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpointURI,
        string calldata fileURI,
        bytes32 fileHash
    ) external;

    /// @notice Get summary stats for an agent
    /// @param agentId The token ID of the agent
    /// @return feedbackCount Total number of feedback entries
    /// @return averageValue Average feedback value (int128, scaled 18 decimals)
    function getSummary(uint256 agentId)
        external
        view
        returns (uint256 feedbackCount, int128 averageValue);

    /// @notice Get all feedback for an agent
    /// @param agentId The token ID of the agent
    function readAllFeedback(uint256 agentId)
        external
        view
        returns (Feedback[] memory);
}
