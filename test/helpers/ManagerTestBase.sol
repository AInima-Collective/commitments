// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {IBackingAdapter} from "src/core/interfaces/IBackingAdapter.sol";
import {ERC20StaticAdapter} from "src/backing/ERC20StaticAdapter.sol";
import {MockERC20} from "./MockERC20.sol";

/// @dev Settable-index adapter for suites that need backing appreciation
///      (premium accrual through `IndexAppreciationYield`).
contract MockIndexAdapter is IBackingAdapter {
    uint256 public index = 1e18;

    function setIndex(uint256 v) external {
        index = v;
    }

    function indexNow(address) external view returns (uint256) {
        return index;
    }

    function payoutDenomination(address token) external pure returns (address) {
        return token;
    }
}

/// @title ManagerTestBase
/// @notice Shared fixture for periphery suites (arbiters, registry, router):
///         a real `CommitmentManager` UUPS proxy, a `MockERC20` backing token,
///         and an `ERC20StaticAdapter`, plus deposit/params helpers. Extend and
///         override `setUp` (call `super.setUp()` first) to add suite-specific
///         actors and contracts.
abstract contract ManagerTestBase is Test {
    CommitmentManager internal manager;
    MockERC20 internal token;
    ERC20StaticAdapter internal staticAdapter;

    address internal admin = makeAddr("admin");

    uint64 internal constant UNBONDING = 7 days;
    uint64 internal constant WINDOW = 2 days;

    function setUp() public virtual {
        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, UNBONDING, 14 days))
                )
            )
        );
        token = new MockERC20("Backing", "BCK", 18);
        staticAdapter = new ERC20StaticAdapter();
    }

    /// @dev Mint + approve + deposit `amount` of the backing token as `who`.
    function _deposit(address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.startPrank(who);
        token.approve(address(manager), amount);
        manager.deposit(address(token), amount);
        vm.stopPrank();
    }

    /// @dev Strategy-free params against the shared token/static adapter.
    function _baseParams(address arbiter_, address counterparty_, uint256 amount, uint16 maxPenaltyBps)
        internal
        view
        returns (ICM.CommitmentParams memory p)
    {
        p.arbiter = arbiter_;
        p.counterparty = counterparty_;
        p.token = address(token);
        p.adapter = address(staticAdapter);
        p.amount = amount;
        p.maxPenaltyBps = maxPenaltyBps;
        p.challengeWindow = WINDOW;
        p.expiresAt = 0;
        p.strategies = new StrategyBinding[](0);
        p.metadataURI = "";
        p.metadataHash = bytes32(0);
    }

    /// @dev Create a commitment as `committer` (must already have free balance).
    function _createAs(address committer, ICM.CommitmentParams memory p) internal returns (uint256 id) {
        vm.prank(committer);
        id = manager.createCommitment(p);
    }
}
