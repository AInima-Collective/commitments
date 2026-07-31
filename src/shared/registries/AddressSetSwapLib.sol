// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title AddressSetSwapLib
/// @notice Swap-and-pop membership mechanics over a `(address[] list, mapping index)` pair,
///         using the **raw-index** convention (`index[a]` holds `a`'s position in `list`).
/// @dev Extracted verbatim from `OperatorRegistry`'s hand-rolled `operatorList` +
///      `operatorListIndex` plumbing so the logic is shared without disturbing the registry's
///      slot-locked storage. Presence is NOT tracked by this library (raw index 0 is a valid
///      position, not a sentinel) — the caller gates membership out-of-band (the registry uses
///      `operators[a].active`). Contracts whose membership storage is NOT slot-locked should
///      prefer the `Registry` base (OZ `EnumerableSet.AddressSet`, index+1 convention with
///      built-in `contains`) instead.
library AddressSetSwapLib {
    /// @dev Append `account` to `list`, recording its raw index. Caller must ensure `account`
    ///      is not already present (mirrors the registry's `AlreadyRegistered` guard).
    function append(address[] storage list, mapping(address => uint256) storage index, address account) internal {
        index[account] = list.length;
        list.push(account);
    }

    /// @dev Remove `account` from `list` via swap-and-pop in O(1), keeping `index` consistent.
    ///      Caller must ensure `account` is present.
    function swapPopRemove(address[] storage list, mapping(address => uint256) storage index, address account)
        internal
    {
        uint256 idx = index[account];
        uint256 lastIdx = list.length - 1;

        if (idx != lastIdx) {
            address last = list[lastIdx];
            list[idx] = last;
            index[last] = idx;
        }

        list.pop();
        delete index[account];
    }
}
