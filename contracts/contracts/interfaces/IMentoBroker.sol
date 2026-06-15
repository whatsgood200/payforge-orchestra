// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMentoBroker
/// @notice Interface for the Mento v2 Broker contract
/// @dev Mainnet: 0x777B8E2F5F356c5c284342aFbF009D6552450d69
interface IMentoBroker {
    /// @notice Get the expected output amount for a swap
    /// @param exchangeProvider The address of the exchange provider (e.g. BiPoolManager)
    /// @param exchangeId The identifier of the specific trading pair
    /// @param tokenIn The input token address
    /// @param tokenOut The output token address
    /// @param amountIn The amount of tokenIn to swap
    /// @return amountOut The expected amount of tokenOut
    function getAmountOut(
        address exchangeProvider,
        bytes32 exchangeId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 amountOut);

    /// @notice Get the required input amount for a specific output amount
    /// @param exchangeProvider The address of the exchange provider
    /// @param exchangeId The identifier of the specific trading pair
    /// @param tokenIn The input token address
    /// @param tokenOut The output token address
    /// @param amountOut The desired amount of tokenOut
    /// @return amountIn The required amount of tokenIn
    function getAmountIn(
        address exchangeProvider,
        bytes32 exchangeId,
        address tokenIn,
        address tokenOut,
        uint256 amountOut
    ) external view returns (uint256 amountIn);

    /// @notice Execute a swap with a fixed input amount
    /// @param exchangeProvider The address of the exchange provider
    /// @param exchangeId The identifier of the specific trading pair
    /// @param tokenIn The input token address
    /// @param tokenOut The output token address
    /// @param amountIn The amount of tokenIn to swap
    /// @param amountOutMin The minimum acceptable output (slippage protection)
    /// @return amountOut The actual amount of tokenOut received
    function swapIn(
        address exchangeProvider,
        bytes32 exchangeId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin
    ) external returns (uint256 amountOut);

    /// @notice Execute a swap with a fixed output amount
    /// @param exchangeProvider The address of the exchange provider
    /// @param exchangeId The identifier of the specific trading pair
    /// @param tokenIn The input token address
    /// @param tokenOut The output token address
    /// @param amountOut The exact amount of tokenOut to receive
    /// @param amountInMax The maximum acceptable input (slippage protection)
    /// @return amountIn The actual amount of tokenIn spent
    function swapOut(
        address exchangeProvider,
        bytes32 exchangeId,
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        uint256 amountInMax
    ) external returns (uint256 amountIn);

    /// @notice Get all registered exchange providers
    function getExchangeProviders() external view returns (address[] memory);
}
