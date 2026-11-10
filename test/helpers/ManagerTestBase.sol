// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {ERC20StaticAdapter} from "src/backing/ERC20StaticAdapter.sol";
import {MockERC20} from "./MockERC20.sol";

/// @dev Deploy a `CommitmentManager` UUPS proxy. Every suite deploys the manager through
///      here, so a change to how the manager is built or initialized is made once.
function deployManager(address admin, uint64 unbondingPeriod, uint64 pauseBudget) returns (CommitmentManager) {
    CommitmentManager impl = new CommitmentManager();
    return CommitmentManager(
        address(
            new ERC1967Proxy(
                address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, unbondingPeriod, pauseBudget))
            )
        )
    );
}

/// @title ManagerTestBase
/// @notice Shared fixture for manager, strategy and periphery suites:
///         a real `CommitmentManager` UUPS proxy, a `MockERC20` backing token,
///         and an `ERC20StaticAdapter`, plus deposit/params helpers. Extend and
///         override `setUp` (call `super.setUp()` first) to add suite-specific
///         actors and contracts.
abstract contract ManagerTestBase is Test {
    CommitmentManager internal manager;
    MockERC20 internal token;
    ERC20StaticAdapter internal adapter;

    address internal admin = makeAddr("admin");

    uint64 internal constant UNBONDING = 7 days;
    uint64 internal constant WINDOW = 2 days;

    function setUp() public virtual {
        manager = deployManager(admin, UNBONDING, 14 days);
        token = new MockERC20("Backing", "BCK", 18);
        adapter = new ERC20StaticAdapter();
    }

    /// @dev Mint + approve + deposit `amount` of the backing token as `who`.
    function _deposit(address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.startPrank(who);
        token.approve(address(manager), amount);
        manager.deposit(address(token), amount);
        vm.stopPrank();
    }

    /// @dev Mint `amount` to `who`, approve the manager for everything, and deposit it all.
    function _fund(address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.startPrank(who);
        token.approve(address(manager), type(uint256).max);
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
        p.adapter = address(adapter);
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
