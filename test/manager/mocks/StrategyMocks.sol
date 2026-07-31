// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {
    IDistributionStrategy,
    TokenMovement,
    CreatedContext,
    DistributeContext,
    ClaimContext,
    LifecycleContext,
    ForfeitContext
} from "src/core/interfaces/IDistributionStrategy.sol";

/// @dev Hook discriminators for RecordingStrategy.setMoves.
uint8 constant MOCK_DISTRIBUTE = 0;
uint8 constant MOCK_CLAIM = 1;
uint8 constant MOCK_RELEASED = 2;
uint8 constant MOCK_FORFEITED = 3;

/// @title RecordingStrategy
/// @notice Programmable well-behaved strategy: records every hook invocation and returns
///         whatever movements the test programmed per hook. Programming theft/over-cap
///         movements turns it into the InvalidMovementStrategy of the test plan.
contract RecordingStrategy is IDistributionStrategy {
    uint256 public createdCalls;
    uint256 public releasedCalls;
    uint256 public forfeitedCalls;
    uint256 public distributeCalls;
    uint256 public claimCalls;

    uint256 public lastCommitmentId;
    bytes public lastStrategyParams;
    uint256 public lastCurrentEncumbered;
    uint256 public lastForfeitedUnits;
    uint16 public lastPenaltyBps;
    uint64 public lastClosedAt;
    address public lastCaller;

    bool public revertOnCreated;
    bool public revertOnLifecycle;
    uint256 public pendingValue;

    mapping(uint8 => TokenMovement[]) internal _moves;

    function setRevertOnCreated(bool v) external {
        revertOnCreated = v;
    }

    /// @dev Toggleable lifecycle failure — models a transient environmental revert that later
    ///      clears (the sweepFailedHook re-drive scenario).
    function setRevertOnLifecycle(bool v) external {
        revertOnLifecycle = v;
    }

    function setPendingValue(uint256 v) external {
        pendingValue = v;
    }

    function setMoves(uint8 hook, TokenMovement[] calldata moves) external {
        delete _moves[hook];
        for (uint256 i; i < moves.length; i++) {
            _moves[hook].push(moves[i]);
        }
    }

    function onCommitmentCreated(CreatedContext calldata ctx) external virtual {
        if (revertOnCreated) revert("incompatible-adapter");
        createdCalls++;
        lastCommitmentId = ctx.base.commitmentId;
        lastStrategyParams = ctx.strategyParams;
    }

    function onCommitmentReleased(LifecycleContext calldata ctx) external virtual returns (TokenMovement[] memory) {
        if (revertOnLifecycle) revert("temporarily down");
        releasedCalls++;
        lastCommitmentId = ctx.base.commitmentId;
        lastCurrentEncumbered = ctx.base.currentEncumbered;
        return _moves[MOCK_RELEASED];
    }

    function onCommitmentForfeited(ForfeitContext calldata ctx) external virtual returns (TokenMovement[] memory) {
        if (revertOnLifecycle) revert("temporarily down");
        forfeitedCalls++;
        lastCommitmentId = ctx.base.commitmentId;
        lastCurrentEncumbered = ctx.base.currentEncumbered;
        lastForfeitedUnits = ctx.forfeitedUnits;
        lastPenaltyBps = ctx.penaltyBps;
        return _moves[MOCK_FORFEITED];
    }

    function distribute(DistributeContext calldata ctx) external virtual returns (TokenMovement[] memory) {
        distributeCalls++;
        lastCommitmentId = ctx.base.commitmentId;
        lastCaller = ctx.caller;
        return _moves[MOCK_DISTRIBUTE];
    }

    function claim(ClaimContext calldata ctx, bytes calldata) external virtual returns (TokenMovement[] memory) {
        claimCalls++;
        lastCommitmentId = ctx.base.commitmentId;
        lastCaller = ctx.caller;
        lastClosedAt = ctx.closedAt;
        return _moves[MOCK_CLAIM];
    }

    function pending(ClaimContext calldata, bytes calldata) external view virtual returns (uint256) {
        return pendingValue;
    }
}

/// @title NoopStrategy
/// @notice Accepts every binding, returns no movements anywhere.
contract NoopStrategy is RecordingStrategy {}

/// @title RevertingStrategy
/// @notice Accepts the binding, then reverts in every subsequent hook — the "environmental
///         failure" actor for hook-liveness tests.
contract RevertingStrategy is RecordingStrategy {
    function onCommitmentReleased(LifecycleContext calldata) external pure override returns (TokenMovement[] memory) {
        revert("strategy down");
    }

    function onCommitmentForfeited(ForfeitContext calldata) external pure override returns (TokenMovement[] memory) {
        revert("strategy down");
    }

    function distribute(DistributeContext calldata) external pure override returns (TokenMovement[] memory) {
        revert("strategy down");
    }

    function claim(ClaimContext calldata, bytes calldata) external pure override returns (TokenMovement[] memory) {
        revert("strategy down");
    }
}

/// @title GasGuzzlerStrategy
/// @notice Burns the entire gas allowance in lifecycle hooks — the gas-cap actor.
contract GasGuzzlerStrategy is RecordingStrategy {
    uint256 internal _sink;

    function _burn() internal {
        uint256 x = 1;
        while (true) {
            x = uint256(keccak256(abi.encode(x)));
            _sink = x;
        }
    }

    function onCommitmentReleased(LifecycleContext calldata) external override returns (TokenMovement[] memory) {
        _burn();
        return new TokenMovement[](0);
    }

    function onCommitmentForfeited(ForfeitContext calldata) external override returns (TokenMovement[] memory) {
        _burn();
        return new TokenMovement[](0);
    }
}

/// @dev Minimal manager surface ReentrantStrategy needs.
interface IManagerReentry {
    function withdraw(address token, uint256 amount) external;
    function distribute(uint256 commitmentId, address strategy) external;
    function executeForfeit(uint256 commitmentId) external;
}

/// @title ReentrantStrategy
/// @notice Attempts to re-enter mutating manager entry points from inside a lifecycle hook.
///         Every attempt must hit the manager's transient reentrancy lock; the revert bubbles,
///         the guarded frame fails, and the lifecycle transition continues (ERC §A.7 / §D.6).
contract ReentrantStrategy is RecordingStrategy {
    IManagerReentry public manager;
    address public token;

    function configure(address manager_, address token_) external {
        manager = IManagerReentry(manager_);
        token = token_;
    }

    function onCommitmentReleased(LifecycleContext calldata ctx) external override returns (TokenMovement[] memory) {
        manager.distribute(ctx.base.commitmentId, address(this)); // hits the lock → reverts
        return new TokenMovement[](0);
    }

    function onCommitmentForfeited(ForfeitContext calldata ctx) external override returns (TokenMovement[] memory) {
        manager.withdraw(token, 1); // hits the lock → reverts
        ctx; // silence unused warning
        return new TokenMovement[](0);
    }
}
