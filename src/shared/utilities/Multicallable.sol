// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title Multicallable
/// @notice Mixin that batches multiple calls to `this` into a single transaction via
///         self-`delegatecall`, so flows like create-then-delegate settle atomically.
/// @dev Deliberately **non-payable**: batching a `payable` function in a loop lets the
///      same `msg.value` be observed by every sub-call (the classic multicall value
///      footgun). A non-payable `multicall` auto-reverts on any attached value, and each
///      batched function sees `msg.value == 0`, so no per-call value can be double-spent.
///
///      `delegatecall` preserves `msg.sender` and the execution context, so batched
///      functions authenticate against the original caller exactly as a direct call would.
///      Because the guard is a `delegatecall` into the SAME contract, it composes with
///      `ReentrancyGuardTransient`: `multicall` itself is NOT reentrancy-guarded, so each
///      batched (guarded) function enters and exits the transient lock in sequence rather
///      than nesting — a batch of `nonReentrant` calls does not falsely trip the guard.
abstract contract Multicallable {
    /// @notice Batch several calls to this contract into one transaction.
    /// @dev Reverts (bubbling the first failing sub-call's revert data) if any call fails,
    ///      making the batch all-or-nothing. Non-payable by design (see contract docs).
    /// @param data Array of ABI-encoded calldata blobs, each targeting a function on this contract.
    /// @return results The ABI-encoded return data of each sub-call, in order.
    function multicall(bytes[] calldata data) external returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; ++i) {
            (bool ok, bytes memory ret) = address(this).delegatecall(data[i]);
            if (!ok) {
                // Bubble the revert reason of the failing sub-call verbatim.
                assembly {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
            results[i] = ret;
        }
    }
}
