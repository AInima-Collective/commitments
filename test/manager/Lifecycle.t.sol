// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {ERC20StaticAdapter} from "src/backing/ERC20StaticAdapter.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {NoopStrategy} from "./mocks/StrategyMocks.sol";

/// @dev Registry mock that records hooks; can be told to revert (failure isolation test).
contract MockRegistry {
    uint256 public releasedCount;
    uint256 public forfeitedCount;
    uint256 public lastCommitmentId;
    uint256 public lastForfeitedAmount;
    uint256 public lastFullAmount;
    bool public shouldRevert;

    function setRevert(bool v) external {
        shouldRevert = v;
    }

    function onDelegationReleased(uint256 commitmentId, uint256) external {
        if (shouldRevert) revert("registry down");
        releasedCount++;
        lastCommitmentId = commitmentId;
    }

    function onDelegationForfeited(uint256 commitmentId, uint256 forfeitedAmount, uint256 fullAmount) external {
        if (shouldRevert) revert("registry down");
        forfeitedCount++;
        lastCommitmentId = commitmentId;
        lastForfeitedAmount = forfeitedAmount;
        lastFullAmount = fullAmount;
    }
}

/// @dev Registry mock that records the gas it was forwarded (to prove the `{gas: cap}` bound on
///      the delegation hooks) and can optionally burn all of it to force a swallowed out-of-gas.
contract GasProbeRegistry {
    uint256 public gasReceived;
    bool public burnAll;

    function setBurn(bool v) external {
        burnAll = v;
    }

    function onDelegationReleased(uint256, uint256) external {
        gasReceived = gasleft();
        // solhint-disable-next-line no-empty-blocks
        while (burnAll) {} // consume the whole (capped) frame => caught as RegistryHookFailed
    }

    function onDelegationForfeited(uint256, uint256, uint256) external {
        gasReceived = gasleft();
        // solhint-disable-next-line no-empty-blocks
        while (burnAll) {}
    }

    function trackedCommitmentCount() external pure returns (uint256) {
        return 0;
    }
}

/// @dev Minimal ERC-1271 smart-contract wallet: authorizes exactly one digest and returns the
///      magic value for it. Exercises the SignatureChecker (ERC-1271) path in `createCommitmentFor`.
contract MockERC1271Wallet {
    bytes4 internal constant MAGIC = 0x1626ba7e;
    bytes32 public authorizedDigest;

    function authorize(bytes32 digest) external {
        authorizedDigest = digest;
    }

    function isValidSignature(bytes32 hash, bytes calldata) external view returns (bytes4) {
        return (hash != bytes32(0) && hash == authorizedDigest) ? MAGIC : bytes4(0xffffffff);
    }
}

contract LifecycleTestBase is Test {
    CommitmentManager internal manager;
    MockERC20 internal token;
    ERC20StaticAdapter internal adapter;

    address internal admin = makeAddr("admin");
    address internal alice; // committer (has a known private key for relayer tests)
    uint256 internal aliceKey;
    address internal arbiter = makeAddr("arbiter");
    address internal bob = makeAddr("bob"); // counterparty

    uint64 internal constant UNBONDING = 7 days;
    uint64 internal constant WINDOW = 2 days;

    function setUp() public virtual {
        (alice, aliceKey) = makeAddrAndKey("alice");

        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, UNBONDING, 14 days))
                )
            )
        );
        token = new MockERC20("Backing", "BCK", 18);
        adapter = new ERC20StaticAdapter();

        token.mint(alice, 1_000e18);
        vm.startPrank(alice);
        token.approve(address(manager), type(uint256).max);
        manager.deposit(address(token), 1_000e18);
        vm.stopPrank();
    }

    function _params(uint256 amount, uint16 maxPenaltyBps) internal view returns (ICM.CommitmentParams memory p) {
        p.arbiter = arbiter;
        p.counterparty = bob;
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

    function _create(uint256 amount, uint16 maxPenaltyBps) internal returns (uint256 id) {
        vm.prank(alice);
        id = manager.createCommitment(_params(amount, maxPenaltyBps));
    }

    function _partitionHolds() internal view {
        (uint256 free, uint256 enc, uint256 esc, uint256 mp) = manager.ledgerTotals(address(token));
        assertEq(free + enc + esc + mp, token.balanceOf(address(manager)), "INV-1 partition");
    }
}

contract CreateCommitmentTest is LifecycleTestBase {
    function test_create_idsStartAtOne() public {
        uint256 id = _create(100e18, 5000);
        assertEq(id, 1, "INV-10: first id is 1, 0 reserved as sentinel");
    }

    function test_create_encumbersAndTracksExposure() public {
        uint256 id = _create(100e18, 5000);

        assertEq(manager.freeBalance(address(token), alice), 900e18);
        assertEq(manager.encumberedBalance(address(token), alice), 100e18);

        ICM.UserExposure memory mag = manager.getUserExposure(address(token), alice);
        assertEq(mag.totalEncumbered, 100e18);
        assertEq(mag.totalForfeitable, 50e18);

        ICM.Commitment memory c = manager.getCommitment(id);
        assertEq(c.committer, alice);
        assertEq(c.token, address(token));
        assertEq(c.adapter, address(adapter));
        assertEq(c.amount, 100e18);
        assertFalse(c.released);
        assertFalse(c.forfeited);
        _partitionHolds();
    }

    function test_create_insufficientFreeBalanceReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ICM.InsufficientFreeBalance.selector, 1_001e18, 1_000e18));
        manager.createCommitment(_params(1_001e18, 1000));
    }

    function test_create_validationReverts() public {
        ICM.CommitmentParams memory p;

        p = _params(100e18, 1000);
        p.arbiter = address(0);
        vm.prank(alice);
        vm.expectRevert(ICM.ZeroArbiter.selector);
        manager.createCommitment(p);

        p = _params(100e18, 1000);
        p.counterparty = address(0);
        vm.prank(alice);
        vm.expectRevert(ICM.ZeroCounterparty.selector);
        manager.createCommitment(p);

        p = _params(0, 1000);
        vm.prank(alice);
        vm.expectRevert(ICM.ZeroAmount.selector);
        manager.createCommitment(p);

        p = _params(100e18, 10_001);
        vm.prank(alice);
        vm.expectRevert(ICM.PenaltyExceedsMax.selector);
        manager.createCommitment(p);

        p = _params(100e18, 1000);
        p.challengeWindow = 86_399;
        vm.prank(alice);
        vm.expectRevert(ICM.ChallengeWindowTooShort.selector);
        manager.createCommitment(p);

        p = _params(100e18, 1000);
        p.expiresAt = uint64(block.timestamp); // not in the future
        vm.prank(alice);
        vm.expectRevert(ICM.InvalidExpiry.selector);
        manager.createCommitment(p);

        p = _params(100e18, 1000);
        p.metadataURI = string(new bytes(513));
        vm.prank(alice);
        vm.expectRevert(ICM.URITooLong.selector);
        manager.createCommitment(p);
    }

    function test_create_shippingManagerCannotUseChallengeWindowBelowOneDay() public {
        vm.prank(admin);
        vm.expectRevert(ICM.MinChallengeWindowBelowFloor.selector);
        manager.setMinChallengeWindow(1);

        ICM.CommitmentParams memory p = _params(100e18, 1000);
        p.challengeWindow = 1 days - 1;
        vm.prank(alice);
        vm.expectRevert(ICM.ChallengeWindowTooShort.selector);
        manager.createCommitment(p);

        p.challengeWindow = 1 days;
        vm.prank(alice);
        uint256 id = manager.createCommitment(p);
        assertEq(manager.getCommitment(id).challengeWindow, 1 days, "one-day floor remains creatable");
    }

    function test_create_exposureAllocation_capitalEfficiency() public {
        // 1100 deposited? No — alice has 1000. Commitment A: 600 @ 50% → 300 forfeitable.
        _create(600e18, 5000);
        // Commitment B: 400 @ 40% → 160. total forfeitable 460 ≤ encumbered 1000. OK.
        _create(400e18, 4000);

        ICM.UserExposure memory mag = manager.getUserExposure(address(token), alice);
        assertEq(mag.totalEncumbered, 1_000e18);
        assertEq(mag.totalForfeitable, 460e18);

        // No free balance left: any further amount reverts on the encumber step.
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ICM.InsufficientFreeBalance.selector, 1, 0));
        manager.createCommitment(_params(1, 0));
    }

    function test_create_exposureKeyedPerToken() public {
        // A second token's exposure is independent of the first's.
        MockERC20 token2 = new MockERC20("Other", "OTH", 18);
        token2.mint(alice, 50e18);
        vm.startPrank(alice);
        token2.approve(address(manager), type(uint256).max);
        manager.deposit(address(token2), 50e18);
        vm.stopPrank();

        _create(1_000e18, 10_000); // token1 fully encumbered at 100%

        ICM.CommitmentParams memory p = _params(50e18, 10_000);
        p.token = address(token2);
        vm.prank(alice);
        manager.createCommitment(p); // independent (user, token2) exposure — succeeds

        assertEq(manager.getUserExposure(address(token), alice).totalForfeitable, 1_000e18);
        assertEq(manager.getUserExposure(address(token2), alice).totalForfeitable, 50e18);
    }

    function test_create_bindsStrategiesInOrder_andRunsCreationHooks() public {
        NoopStrategy strategyA = new NoopStrategy();
        NoopStrategy strategyB = new NoopStrategy();
        ICM.CommitmentParams memory p = _params(100e18, 1000);
        p.strategies = new StrategyBinding[](2);
        p.strategies[0] = StrategyBinding(address(strategyA), hex"01");
        p.strategies[1] = StrategyBinding(address(strategyB), hex"02");

        vm.expectEmit(true, true, false, true);
        emit ICM.CommitmentBoundToStrategy(1, address(strategyA), hex"01");
        vm.expectEmit(true, true, false, true);
        emit ICM.CommitmentBoundToStrategy(1, address(strategyB), hex"02");
        vm.prank(alice);
        uint256 id = manager.createCommitment(p);

        address[] memory bound = manager.strategiesOf(id);
        assertEq(bound.length, 2);
        assertEq(bound[0], address(strategyA));
        assertEq(bound[1], address(strategyB));

        // onCommitmentCreated ran with the binding params delivered via context.
        assertEq(strategyA.createdCalls(), 1);
        assertEq(strategyA.lastStrategyParams(), hex"01");
        assertEq(strategyB.lastStrategyParams(), hex"02");
    }

    function test_create_strategyRefusalAbortsCreation() public {
        NoopStrategy refusing = new NoopStrategy();
        refusing.setRevertOnCreated(true);
        ICM.CommitmentParams memory p = _params(100e18, 1000);
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding(address(refusing), "");

        vm.prank(alice);
        vm.expectRevert(bytes("incompatible-adapter"));
        manager.createCommitment(p);

        // Atomic abort: nothing was encumbered.
        assertEq(manager.encumberedBalance(address(token), alice), 0);
        assertEq(manager.freeBalance(address(token), alice), 1_000e18);
    }

    function test_create_tooManyStrategiesReverts() public {
        ICM.CommitmentParams memory p = _params(100e18, 1000);
        p.strategies = new StrategyBinding[](9);
        for (uint256 i; i < 9; i++) {
            p.strategies[i] = StrategyBinding(makeAddr(string.concat("s", vm.toString(i))), "");
        }
        vm.prank(alice);
        vm.expectRevert(ICM.TooManyStrategies.selector);
        manager.createCommitment(p);
    }

    function test_create_duplicateStrategyReverts() public {
        NoopStrategy strategyA = new NoopStrategy();
        ICM.CommitmentParams memory p = _params(100e18, 1000);
        p.strategies = new StrategyBinding[](2);
        p.strategies[0] = StrategyBinding(address(strategyA), "");
        p.strategies[1] = StrategyBinding(address(strategyA), "");
        vm.prank(alice);
        vm.expectRevert(ICM.DuplicateStrategy.selector);
        manager.createCommitment(p);
    }
}

contract ReleaseExpireTest is LifecycleTestBase {
    function test_release_freesEncumbranceAndExposure() public {
        uint256 id = _create(100e18, 5000);

        vm.expectEmit(true, true, false, true);
        emit ICM.CommitmentReleased(id, arbiter);
        vm.prank(arbiter);
        manager.releaseCommitment(id);

        assertEq(manager.freeBalance(address(token), alice), 1_000e18);
        assertEq(manager.encumberedBalance(address(token), alice), 0);
        ICM.UserExposure memory mag = manager.getUserExposure(address(token), alice);
        assertEq(mag.totalEncumbered, 0);
        assertEq(mag.totalForfeitable, 0);
        assertTrue(manager.getCommitment(id).released);
        _partitionHolds();
    }

    function test_release_onlyArbiter() public {
        uint256 id = _create(100e18, 5000);
        vm.prank(alice);
        vm.expectRevert(ICM.NotArbiter.selector);
        manager.releaseCommitment(id);
    }

    function test_release_inactiveReverts() public {
        uint256 id = _create(100e18, 5000);
        vm.startPrank(arbiter);
        manager.releaseCommitment(id);
        vm.expectRevert(ICM.CommitmentInactive.selector);
        manager.releaseCommitment(id);
        vm.stopPrank();
    }

    function test_expire_committerAfterExpiry() public {
        ICM.CommitmentParams memory p = _params(100e18, 5000);
        p.expiresAt = uint64(block.timestamp + 30 days);
        vm.prank(alice);
        uint256 id = manager.createCommitment(p);

        vm.prank(alice);
        vm.expectRevert(ICM.CommitmentNotExpired.selector);
        manager.expireCommitment(id);

        vm.warp(block.timestamp + 30 days);
        vm.prank(alice);
        manager.expireCommitment(id);
        assertEq(manager.freeBalance(address(token), alice), 1_000e18);
    }

    function test_expire_noExpiryReverts() public {
        uint256 id = _create(100e18, 5000);
        vm.prank(alice);
        vm.expectRevert(ICM.CommitmentHasNoExpiry.selector);
        manager.expireCommitment(id);
    }

    function test_expire_onlyCommitter() public {
        ICM.CommitmentParams memory p = _params(100e18, 5000);
        p.expiresAt = uint64(block.timestamp + 1 days);
        vm.prank(alice);
        uint256 id = manager.createCommitment(p);
        vm.warp(block.timestamp + 2 days);
        vm.prank(bob);
        vm.expectRevert(ICM.NotCommitter.selector);
        manager.expireCommitment(id);
    }

    function test_expire_blockedByActiveForfeit() public {
        ICM.CommitmentParams memory p = _params(100e18, 5000);
        p.expiresAt = uint64(block.timestamp + 1 days);
        vm.prank(alice);
        uint256 id = manager.createCommitment(p);

        vm.prank(arbiter);
        manager.initiateForfeit(id, 1000);

        vm.warp(block.timestamp + 2 days);
        vm.prank(alice);
        vm.expectRevert(ICM.ForfeitPending.selector);
        manager.expireCommitment(id);
    }
}

contract ForfeitTest is LifecycleTestBase {
    function test_forfeit_fullFlow_pullPayment() public {
        uint256 id = _create(100e18, 5000);

        vm.prank(arbiter);
        manager.initiateForfeit(id, 3000); // 30% of 100 = 30

        // Before the window: execution blocked.
        vm.expectRevert(ICM.ChallengeWindowActive.selector);
        manager.executeForfeit(id);

        vm.warp(block.timestamp + WINDOW);
        vm.expectEmit(true, false, true, true);
        emit ICM.ForfeitExecuted(id, 30e18, bob);
        manager.executeForfeit(id); // permissionless

        // Pull-payment: bob's FREE ledger balance is credited; no external transfer happened.
        assertEq(manager.freeBalance(address(token), bob), 30e18);
        // Residual returned to alice's free balance.
        assertEq(manager.freeBalance(address(token), alice), 970e18);
        assertEq(manager.encumberedBalance(address(token), alice), 0);
        // Exposure fully decremented.
        assertEq(manager.getUserExposure(address(token), alice).totalEncumbered, 0);
        assertEq(manager.getUserExposure(address(token), alice).totalForfeitable, 0);
        assertTrue(manager.getCommitment(id).forfeited);
        _partitionHolds();

        // Bob withdraws on his own schedule (instant).
        vm.prank(bob);
        manager.withdraw(address(token), 30e18);
        assertEq(token.balanceOf(bob), 30e18);
    }

    function test_initiateForfeit_auth_and_caps() public {
        uint256 id = _create(100e18, 5000);

        vm.prank(bob);
        vm.expectRevert(ICM.NotArbiter.selector);
        manager.initiateForfeit(id, 1000);

        vm.prank(arbiter);
        vm.expectRevert(ICM.PenaltyExceedsMax.selector);
        manager.initiateForfeit(id, 5001);

        vm.prank(arbiter);
        manager.initiateForfeit(id, 5000);

        vm.prank(arbiter);
        vm.expectRevert(ICM.ForfeitPending.selector);
        manager.initiateForfeit(id, 1000);
    }

    function test_executeForfeit_pausedBlocks() public {
        uint256 id = _create(100e18, 5000);
        vm.prank(arbiter);
        manager.initiateForfeit(id, 5000);
        vm.warp(block.timestamp + WINDOW);

        vm.startPrank(admin);
        manager.grantRole(manager.PAUSER_ROLE(), admin);
        manager.grantRole(manager.UNPAUSER_ROLE(), admin);
        manager.pauseForfeiture();
        vm.stopPrank();

        vm.expectRevert(ICM.ForfeitureIsPaused.selector);
        manager.executeForfeit(id);

        vm.prank(admin);
        manager.unpauseForfeiture();
        manager.executeForfeit(id);
    }

    function test_cancelForfeit_arbiterOnly() public {
        uint256 id = _create(100e18, 5000);
        vm.prank(arbiter);
        manager.initiateForfeit(id, 5000);

        vm.prank(bob);
        vm.expectRevert(ICM.NotArbiter.selector);
        manager.cancelForfeit(id);

        vm.prank(arbiter);
        manager.cancelForfeit(id);

        // After cancel, the commitment is releasable and a new proposal is possible.
        vm.prank(arbiter);
        manager.initiateForfeit(id, 1000);
    }

    function test_cancelStaleForfeitProposal_unblocksAfterTTL() public {
        uint256 id = _create(100e18, 5000);
        vm.prank(arbiter);
        manager.initiateForfeit(id, 5000);

        vm.expectRevert(ICM.ChallengeWindowActive.selector);
        manager.cancelStaleForfeitProposal(id);

        vm.warp(block.timestamp + WINDOW + 14 days);
        manager.cancelStaleForfeitProposal(id); // permissionless
        assertFalse(manager.getCommitment(id).forfeited);
    }

    function test_forfeit_at100Percent_leavesNoResidual() public {
        uint256 id = _create(100e18, 10_000);
        vm.prank(arbiter);
        manager.initiateForfeit(id, 10_000);
        vm.warp(block.timestamp + WINDOW);
        manager.executeForfeit(id);

        assertEq(manager.freeBalance(address(token), bob), 100e18);
        assertEq(manager.freeBalance(address(token), alice), 900e18);
        _partitionHolds();
    }
}

contract UnbondTest is LifecycleTestBase {
    function test_unbond_fullFlow() public {
        uint256 id = _create(100e18, 5000);

        vm.prank(alice);
        manager.requestUnbond(id);

        // No ledger change during the window (ERC §C.5).
        assertEq(manager.encumberedBalance(address(token), alice), 100e18);
        assertEq(manager.getUserExposure(address(token), alice).totalForfeitable, 50e18);

        vm.expectRevert(abi.encodeWithSelector(ICM.UnbondNotElapsed.selector, uint64(block.timestamp) + UNBONDING));
        manager.finalizeUnbond(id);

        vm.warp(block.timestamp + UNBONDING);
        manager.finalizeUnbond(id); // permissionless
        assertEq(manager.freeBalance(address(token), alice), 1_000e18);
        assertTrue(manager.getCommitment(id).released);
    }

    function test_unbond_committerOnly_singlePending() public {
        uint256 id = _create(100e18, 5000);
        vm.prank(bob);
        vm.expectRevert(ICM.NotCommitter.selector);
        manager.requestUnbond(id);

        vm.startPrank(alice);
        manager.requestUnbond(id);
        vm.expectRevert(ICM.UnbondAlreadyRequested.selector);
        manager.requestUnbond(id);
        vm.stopPrank();
    }

    function test_unbond_arbiterRetainsForfeitAuthorityDuringWindow() public {
        uint256 id = _create(100e18, 5000);
        vm.prank(alice);
        manager.requestUnbond(id);

        vm.prank(arbiter);
        manager.initiateForfeit(id, 5000);

        vm.warp(block.timestamp + UNBONDING);
        vm.expectRevert(ICM.UnbondBlockedByForfeit.selector);
        manager.finalizeUnbond(id);

        // Forfeit lands even though unbond matured first.
        manager.executeForfeit(id);
        assertEq(manager.freeBalance(address(token), bob), 50e18);
    }

    function test_unbond_blockedForfeitThenStaleCancelUnblocks() public {
        uint256 id = _create(100e18, 5000);
        vm.prank(alice);
        manager.requestUnbond(id);
        vm.prank(arbiter);
        manager.initiateForfeit(id, 5000);

        vm.warp(block.timestamp + WINDOW + 14 days + UNBONDING);
        manager.cancelStaleForfeitProposal(id);
        manager.finalizeUnbond(id);
        assertEq(manager.freeBalance(address(token), alice), 1_000e18);
    }

    function test_cancelUnbond() public {
        uint256 id = _create(100e18, 5000);
        vm.startPrank(alice);
        manager.requestUnbond(id);
        manager.cancelUnbond(id);
        vm.stopPrank();
        assertEq(manager.unbondInitiatedAt(id), 0);

        vm.warp(block.timestamp + UNBONDING);
        vm.expectRevert(ICM.NoUnbondPending.selector);
        manager.finalizeUnbond(id);
    }
}

contract RelayerBatchTest is LifecycleTestBase {
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    function _digest(ICM.CommitmentParams memory p, uint256 nonce, uint256 deadline) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("Commitments")),
                keccak256(bytes("1")),
                block.chainid,
                address(manager)
            )
        );
        bytes32 structHash = keccak256(
            bytes.concat(
                abi.encode(
                    manager.CREATE_COMMITMENT_TYPEHASH(), alice, p.arbiter, p.counterparty, p.token, p.adapter, p.amount
                ),
                abi.encode(
                    uint256(p.maxPenaltyBps),
                    uint256(p.challengeWindow),
                    uint256(p.expiresAt),
                    keccak256(abi.encode(p.strategies)),
                    keccak256(bytes(p.metadataURI)),
                    p.metadataHash,
                    nonce,
                    deadline
                )
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function test_createCommitmentFor_validSignature() public {
        ICM.CommitmentParams memory p = _params(100e18, 5000);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 sVal) = vm.sign(aliceKey, _digest(p, 0, deadline));

        address relayer = makeAddr("relayer");
        vm.prank(relayer);
        uint256 id = manager.createCommitmentFor(alice, p, deadline, 0, abi.encodePacked(r, sVal, v));

        assertEq(manager.getCommitment(id).committer, alice, "encumbers the signer, not the relayer");
        assertEq(manager.nonces(alice), 1);
    }

    function test_createCommitmentFor_rejectsBadInputs() public {
        ICM.CommitmentParams memory p = _params(100e18, 5000);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 sVal) = vm.sign(aliceKey, _digest(p, 0, deadline));
        bytes memory sig = abi.encodePacked(r, sVal, v);

        // Wrong nonce.
        vm.expectRevert(ICM.InvalidNonce.selector);
        manager.createCommitmentFor(alice, p, deadline, 1, sig);

        // Expired deadline.
        vm.warp(deadline + 1);
        vm.expectRevert(ICM.SignatureExpired.selector);
        manager.createCommitmentFor(alice, p, deadline, 0, sig);
        vm.warp(deadline - 1 hours);

        // Tampered params -> signer mismatch.
        ICM.CommitmentParams memory tampered = _params(200e18, 5000);
        vm.expectRevert(ICM.InvalidSignature.selector);
        manager.createCommitmentFor(alice, tampered, deadline, 0, sig);
    }

    /// @dev Digest builder parameterized by `committer` (the EOA path hardcodes `alice`); needed to
    ///      authorize a contract wallet whose address differs from `alice`.
    function _digestFor(address committer, ICM.CommitmentParams memory p, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("Commitments")),
                keccak256(bytes("1")),
                block.chainid,
                address(manager)
            )
        );
        bytes32 structHash = keccak256(
            bytes.concat(
                abi.encode(
                    manager.CREATE_COMMITMENT_TYPEHASH(),
                    committer,
                    p.arbiter,
                    p.counterparty,
                    p.token,
                    p.adapter,
                    p.amount
                ),
                abi.encode(
                    uint256(p.maxPenaltyBps),
                    uint256(p.challengeWindow),
                    uint256(p.expiresAt),
                    keccak256(abi.encode(p.strategies)),
                    keccak256(bytes(p.metadataURI)),
                    p.metadataHash,
                    nonce,
                    deadline
                )
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function test_createCommitmentFor_erc1271Wallet() public {
        MockERC1271Wallet wallet = new MockERC1271Wallet();

        // Fund the wallet's free balance so the created commitment can encumber it.
        token.mint(address(this), 100e18);
        token.approve(address(manager), 100e18);
        manager.depositFor(address(token), 100e18, address(wallet));

        ICM.CommitmentParams memory p = _params(100e18, 5000);
        uint256 deadline = block.timestamp + 1 hours;

        // The wallet authorizes the exact EIP-712 digest the manager will check. `sig` is empty —
        // the mock validates by digest match, not by decoding the signature bytes.
        wallet.authorize(_digestFor(address(wallet), p, 0, deadline));

        address relayer = makeAddr("relayer");
        vm.prank(relayer);
        uint256 id = manager.createCommitmentFor(address(wallet), p, deadline, 0, "");

        assertEq(manager.getCommitment(id).committer, address(wallet), "encumbers the wallet, not the relayer");
        assertEq(manager.encumberedBalance(address(token), address(wallet)), 100e18, "wallet's free balance encumbered");
        assertEq(manager.nonces(address(wallet)), 1);
    }

    function test_createCommitmentFor_erc1271Wallet_rejectsUnauthorized() public {
        MockERC1271Wallet wallet = new MockERC1271Wallet();

        token.mint(address(this), 100e18);
        token.approve(address(manager), 100e18);
        manager.depositFor(address(token), 100e18, address(wallet));

        ICM.CommitmentParams memory p = _params(100e18, 5000);
        uint256 deadline = block.timestamp + 1 hours;

        // Wallet authorizes a DIFFERENT digest (wrong nonce) -> isValidSignature returns 0xffffffff.
        wallet.authorize(_digestFor(address(wallet), p, 99, deadline));

        vm.expectRevert(ICM.InvalidSignature.selector);
        manager.createCommitmentFor(address(wallet), p, deadline, 0, "");
    }

    // ---- Signature revocation (#60) ----

    function test_invalidateCreateAuthorization_revokesOutstandingSignature() public {
        ICM.CommitmentParams memory p = _params(100e18, 5000);
        uint256 deadline = block.timestamp + 1 hours;
        // alice signs an authorization for her current nonce (0).
        (uint8 v, bytes32 r, bytes32 sVal) = vm.sign(aliceKey, _digest(p, 0, deadline));
        bytes memory sig = abi.encodePacked(r, sVal, v);

        // alice revokes: her nonce advances 0 -> 1.
        vm.expectEmit(true, false, false, true);
        emit ICM.CreateAuthorizationInvalidated(alice, 1);
        vm.prank(alice);
        uint256 newNonce = manager.invalidateCreateAuthorization();
        assertEq(newNonce, 1, "returns the bumped nonce");
        assertEq(manager.nonces(alice), 1);

        // The outstanding signature (bound to nonce 0) no longer matches.
        address relayer = makeAddr("relayer");
        vm.prank(relayer);
        vm.expectRevert(ICM.InvalidNonce.selector);
        manager.createCommitmentFor(alice, p, deadline, 0, sig);
    }

    function test_invalidateCreateAuthorization_onlyAffectsCallersNonce() public {
        // bob revoking does not touch alice's nonce; alice's authorization still works.
        vm.prank(bob);
        manager.invalidateCreateAuthorization();
        assertEq(manager.nonces(bob), 1);
        assertEq(manager.nonces(alice), 0, "caller can only bump their own nonce");

        ICM.CommitmentParams memory p = _params(100e18, 5000);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 sVal) = vm.sign(aliceKey, _digest(p, 0, deadline));
        vm.prank(makeAddr("relayer"));
        uint256 id = manager.createCommitmentFor(alice, p, deadline, 0, abi.encodePacked(r, sVal, v));
        assertEq(manager.getCommitment(id).committer, alice);
    }
}

contract RegistryHookTest is LifecycleTestBase {
    MockRegistry internal registry;

    function setUp() public override {
        super.setUp();
        registry = new MockRegistry();
        vm.prank(admin);
        manager.setOperatorRegistry(address(registry));
    }

    function test_releaseNotifiesRegistry() public {
        uint256 id = _create(100e18, 5000);
        vm.prank(arbiter);
        manager.releaseCommitment(id);
        assertEq(registry.releasedCount(), 1);
        assertEq(registry.lastCommitmentId(), id);
    }

    function test_forfeitNotifiesRegistry() public {
        uint256 id = _create(100e18, 5000);
        vm.prank(arbiter);
        manager.initiateForfeit(id, 3000);
        vm.warp(block.timestamp + WINDOW);
        manager.executeForfeit(id);
        assertEq(registry.forfeitedCount(), 1);
        assertEq(registry.lastForfeitedAmount(), 30e18);
        assertEq(registry.lastFullAmount(), 100e18);
    }

    function test_registryFailure_doesNotBlock_emitsEvent() public {
        uint256 id = _create(100e18, 5000);
        registry.setRevert(true);

        vm.expectEmit(true, true, false, false);
        emit ICM.RegistryHookFailed(id, MockRegistry.onDelegationReleased.selector);
        vm.prank(arbiter);
        manager.releaseCommitment(id); // completes despite the registry being down

        assertTrue(manager.getCommitment(id).released);
        assertEq(manager.freeBalance(address(token), alice), 1_000e18);
    }

    /// @notice A caller cannot hand-tune gas so the notification silently parks (a swallowed
    ///         out-of-gas) while the release still lands: the §D.6 rule-3 min-gas guard reverts the
    ///         WHOLE transaction when the frame cannot genuinely receive the full cap.
    function test_registryHook_gasStarvation_revertsWholeTransaction() public {
        uint256 id = _create(100e18, 5000);

        // 400k < cap (500k) + cap/63 + reserve (50k): not enough for the hook frame to receive
        // its full cap, so the guard must revert the entire release.
        vm.prank(arbiter);
        (bool success, bytes memory data) =
            address(manager).call{gas: 400_000}(abi.encodeCall(CommitmentManager.releaseCommitment, (id)));

        assertFalse(success, "starved call reverts");
        assertEq(bytes4(data), ICM.InsufficientGasForHook.selector, "explicit starvation error");
        assertFalse(manager.getCommitment(id).released, "nothing partial: release did not land");

        // With adequate gas the same release completes, registry notified.
        vm.prank(arbiter);
        manager.releaseCommitment(id);
        assertTrue(manager.getCommitment(id).released);
        assertEq(registry.releasedCount(), 1);
    }
}

/// @notice The delegation hook is gas-capped exactly like the strategy hooks (§D.6): even with a
///         full transaction's gas available, the registry receives at most the configured cap — a
///         buggy or malicious registry cannot burn unbounded gas to grief the lifecycle transition.
contract RegistryHookGasCapTest is LifecycleTestBase {
    GasProbeRegistry internal probe;

    function setUp() public override {
        super.setUp();
        probe = new GasProbeRegistry();
        vm.prank(admin);
        manager.setOperatorRegistry(address(probe));
    }

    function test_registryHook_receivesAtMostTheCap() public {
        uint256 id = _create(100e18, 5000);
        vm.prank(arbiter);
        manager.releaseCommitment{gas: 10_000_000}(id); // abundant gas at the top of the call

        uint256 cap = manager.hookGasCap(); // 500k default
        assertGt(probe.gasReceived(), 0, "hook ran");
        assertLe(probe.gasReceived(), cap, "hook received at most the cap, not the whole frame");
        assertTrue(manager.getCommitment(id).released);
    }

    /// @notice A hook that burns its whole (capped) frame is caught as RegistryHookFailed and the
    ///         release still lands — the cap turns an unbounded burn into a bounded, parked failure.
    function test_registryHook_burnAll_isCappedAndParked() public {
        probe.setBurn(true);
        uint256 id = _create(100e18, 5000);

        vm.expectEmit(true, true, false, false);
        emit ICM.RegistryHookFailed(id, GasProbeRegistry.onDelegationReleased.selector);
        vm.prank(arbiter);
        manager.releaseCommitment{gas: 10_000_000}(id);

        assertTrue(manager.getCommitment(id).released, "release lands despite the guzzling registry");
    }
}

/// @notice Locks the three storage-backed views added for #60: `closedAt`, `forfeitedUnitsOf`,
///         `acceptsContributions`. All read state that was in storage but had no getter, and that
///         `getCommitment()` cannot surface (its `amount` is zeroed at close).
contract MissingViewsTest is LifecycleTestBase {
    function test_closedAt_zeroWhileActive_setOnRelease() public {
        uint256 id = _create(100e18, 5000);
        assertEq(manager.closedAt(id), 0, "active commitment has closedAt 0");

        vm.warp(block.timestamp + 12 hours);
        vm.prank(arbiter);
        manager.releaseCommitment(id);

        assertEq(manager.closedAt(id), uint64(block.timestamp), "closedAt stamped at release");
    }

    function test_closedAt_setOnForfeit() public {
        uint256 id = _create(100e18, 5000);
        vm.prank(arbiter);
        manager.initiateForfeit(id, 3000);
        vm.warp(block.timestamp + WINDOW);
        manager.executeForfeit(id);

        assertEq(manager.closedAt(id), uint64(block.timestamp), "closedAt stamped at forfeit execute");
    }

    function test_forfeitedUnitsOf_zeroUntilExecute_thenPersisted() public {
        uint256 id = _create(100e18, 5000);
        assertEq(manager.forfeitedUnitsOf(id), 0, "no forfeit yet");

        vm.prank(arbiter);
        manager.initiateForfeit(id, 3000); // 30% of 100 = 30
        assertEq(manager.forfeitedUnitsOf(id), 0, "still zero while proposal pending");

        vm.warp(block.timestamp + WINDOW);
        manager.executeForfeit(id);
        // getCommitment().amount is now the residual; forfeitedUnitsOf is the only surviving magnitude.
        assertEq(manager.forfeitedUnitsOf(id), 30e18, "forfeited units persisted post-close");
    }
}
