// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {CommitmentManagerStorage} from "src/core/manager/storage/CommitmentManagerStorage.sol";
import {LedgerLib} from "src/core/manager/libraries/LedgerLib.sol";
import {MeasuredPull} from "src/shared/utilities/MeasuredPull.sol";

/// @title LedgerOpsLib
/// @notice External delegatecall library hosting the Part A custody perimeter — deposit, withdraw,
///         and permissionless strategy funding — including the fee-on-transfer-defensive
///         measured-balance rule (ERC §A.2/§A.4). The manager keeps only `nonReentrant` dispatch
///         wrappers; this split keeps it under the 24,576-byte bytecode limit.
/// @dev `msg.sender`, `address(this)`, and event sourcing are preserved under delegatecall, so the
///      token transfers and events behave exactly as if they lived on the manager. Every balance
///      write goes through LedgerLib.
library LedgerOpsLib {
    using SafeERC20 for IERC20;

    /// @notice Deposit `amount` of `token` into `msg.sender`'s free balance, crediting the MEASURED
    ///         balance delta (fee-on-transfer defense). Rebasing tokens are structurally unsupported.
    function depositCore(CommitmentManagerStorage.Layout storage s, address token, uint256 amount) external {
        deposit(s, token, amount, msg.sender);
    }

    /// @notice Deposit `amount` of `token` pulled from `msg.sender` into `onBehalfOf`'s free balance,
    ///         crediting the MEASURED balance delta (fee-on-transfer defense). Lets a relayer fund a
    ///         committer's free balance so `createCommitmentFor` composes into one-signature onboarding.
    ///         The `Deposited` event's `user` is the credited account (`onBehalfOf`), not the payer.
    function depositForCore(
        CommitmentManagerStorage.Layout storage s,
        address token,
        uint256 amount,
        address onBehalfOf
    ) external {
        if (onBehalfOf == address(0)) revert ICM.ZeroAddress();
        deposit(s, token, amount, onBehalfOf);
    }

    /// @notice Deposit via an ERC-2612 permit: consume the caller's signed allowance, then deposit
    ///         `amount` of `token` into the caller's free balance. Collapses approve + deposit into a
    ///         single tx for permit-supporting tokens. Measured-delta rule as in `depositCore`.
    /// @dev The `permit` call is wrapped in try/catch: if it were front-run (a griefer submits the
    ///      same signed permit first, consuming the ERC-2612 nonce), `permit` reverts but the deposit
    ///      still proceeds as long as the allowance is already in place — the standard anti-grief
    ///      pattern. If neither the permit nor a pre-existing allowance covers `amount`, the
    ///      subsequent `transferFrom` reverts, so a genuinely missing approval still fails loudly.
    function depositWithPermitCore(
        CommitmentManagerStorage.Layout storage s,
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 sig
    ) external {
        try IERC20Permit(token).permit(msg.sender, address(this), amount, deadline, v, r, sig) {} catch {}
        deposit(s, token, amount, msg.sender);
    }

    /// @notice The one deposit body: pull `amount` of `token` from `msg.sender` and credit the
    ///         measured receipt to `to`'s free balance. Internal so the deposit-then-create path
    ///         inlines it, crediting the caller it pulled from.
    function deposit(CommitmentManagerStorage.Layout storage s, address token, uint256 amount, address to) internal {
        if (amount == 0) revert ICM.ZeroAmount();
        uint256 received = MeasuredPull.pull(token, amount);
        if (received == 0) revert ICM.ZeroAmount();
        LedgerLib.creditFree(s, token, to, received);
        emit ICM.Deposited(to, token, received);
    }

    /// @notice Withdraw `amount` of `token` from `msg.sender`'s free balance. Instant — free balance
    ///         backs nothing and is never subject to an unbonding delay (ERC §A.2). CEI ordering.
    function withdrawCore(CommitmentManagerStorage.Layout storage s, address token, uint256 amount) external {
        if (amount == 0) revert ICM.ZeroAmount();
        LedgerLib.debitFree(s, token, msg.sender, amount); // effects before interaction (CEI)
        IERC20(token).safeTransfer(msg.sender, amount);
        emit ICM.Withdrawn(msg.sender, token, amount);
    }

    /// @notice Permissionlessly fund `strategy`'s escrow with `amount` of `token` (ERC §A.4).
    ///         Measured-delta rule as in `depositCore`. Refund policy is strategy-defined.
    function fundStrategyCore(
        CommitmentManagerStorage.Layout storage s,
        address strategy,
        address token,
        uint256 amount
    ) external {
        if (strategy == address(0)) revert ICM.ZeroAddress();
        if (amount == 0) revert ICM.ZeroAmount();
        uint256 received = MeasuredPull.pull(token, amount);
        if (received == 0) revert ICM.ZeroAmount();
        LedgerLib.creditEscrow(s, strategy, token, received);
        emit ICM.StrategyFunded(msg.sender, strategy, token, received);
    }
}
