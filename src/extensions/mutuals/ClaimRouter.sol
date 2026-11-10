// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";

/// @title ClaimRouter
/// @notice The beneficiary of a Mutual. Settled member units land
///         in this contract's FREE balance in the manager; the designated `claimant` (policyholder)
///         collects them out. Settlement itself is permissionless — anyone (the claimant, a keeper,
///         a bounty bot) can call the manager's `settleMembers` — so the O(N) physical movement of a claim can never
///         brick on a single uncooperative member (ERC-COMMITMENTS-MUTUALS).
/// @dev Default product is **basket settlement**: the claimant receives the members' raw collateral
///      tokens as-is. A swap to a single unit is an explicit, opt-in step the claimant performs
///      after collection — the router never swaps.
contract ClaimRouter is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @notice The custody root whose mutual settlements credit this router.
    ICommitmentManager public immutable manager;
    /// @notice The address entitled to collect the settled basket (the policyholder).
    address public immutable claimant;

    event Settled(uint256 indexed count);
    event Collected(address indexed token, address indexed to, uint256 amount);

    error NotClaimant();
    error ZeroAddress();

    constructor(address manager_, address claimant_) {
        if (manager_ == address(0) || claimant_ == address(0)) revert ZeroAddress();
        manager = ICommitmentManager(manager_);
        claimant = claimant_;
    }

    /// @notice Collect this router's full free balance of `token` to `to` (claimant only). A
    ///         heterogeneous basket is collected one token at a time.
    function collect(address token, address to) public nonReentrant returns (uint256 amount) {
        if (msg.sender != claimant) revert NotClaimant();
        if (to == address(0)) revert ZeroAddress();
        amount = manager.freeBalance(token, address(this));
        if (amount > 0) {
            manager.withdraw(token, amount);
            IERC20(token).safeTransfer(to, amount);
            emit Collected(token, to, amount);
        }
    }

    /// @notice Settle the given members, then collect `token` to `to` (claimant only).
    function settleAndCollect(uint256[] calldata commitmentIds, address token, address to)
        external
        returns (uint256 amount)
    {
        manager.settleMembers(commitmentIds);
        emit Settled(commitmentIds.length);
        amount = collect(token, to);
    }
}
