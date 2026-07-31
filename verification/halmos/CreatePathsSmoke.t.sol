// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {MockERC20} from "test/helpers/MockERC20.sol";
import {HalmosBase} from "./HalmosBase.sol";

/// @title CreatePathsSmokeTest — INV-10 (`commitmentId ≥ 1`; 0 is the non-attribution sentinel)
///        extended to the remaining create paths: `createAndFund` and `batchCreateCommitments`.
///        Each returned id is ≥ 1 and the paths encumber EXACTLY the summed amounts.
/// @dev The relayer path `createCommitmentFor` is intentionally NOT covered here — see the
///      NatSpec on `check_createCommitmentFor_INV10_signaturePathNote`.
/// @dev Run: FOUNDRY_PROFILE=halmos halmos --solver z3 --contract CreatePathsSmokeTest
contract CreatePathsSmokeTest is HalmosBase {
    CommitmentManager internal manager;
    MockERC20 internal token;

    address internal constant COMMITTER = address(0x10001);
    address internal constant ARBITER = address(0x10002);
    address internal constant COUNTERPARTY = address(0x10003);
    address internal constant ADAPTER = address(0x10004);

    uint256 internal constant DEPOSIT = 1_000e18;

    function setUp() public {
        _etchManagerLibs();
        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(CommitmentManager.initialize, (address(0xAD), 7 days, 14 days))
                )
            )
        );

        token = new MockERC20("Backing", "BCK", 18);
        token.mint(COMMITTER, DEPOSIT);
        vm.prank(COMMITTER);
        token.approve(address(manager), type(uint256).max);
        // NOTE: deliberately no prior deposit — createAndFund pulls the deposit itself.
    }

    function _params(uint256 amount) internal view returns (ICM.CommitmentParams memory p) {
        p.arbiter = ARBITER;
        p.counterparty = COUNTERPARTY;
        p.token = address(token);
        p.adapter = ADAPTER;
        p.amount = amount;
        p.maxPenaltyBps = 5_000;
        p.challengeWindow = 86_400;
        // expiresAt = 0, no strategies, empty metadata.
    }

    /// @notice INV-10 for `createAndFund`: for all valid `(depositAmount, amount)` where the
    ///         deposit funds exactly the commitment, the id is ≥ 1 and encumbered == amount, with
    ///         no surplus left in free balance.
    function check_createAndFund_INV10_idNonZeroAndEncumbersExactly(uint256 amount) public {
        vm.assume(amount >= 1 && amount <= DEPOSIT);

        // Deposit exactly `amount` and encumber all of it: free ends at 0, encumbered at amount.
        vm.prank(COMMITTER);
        uint256 id = manager.createAndFund(amount, _params(amount));

        assert(id >= 1);
        assert(manager.freeBalance(address(token), COMMITTER) == 0);
        assert(manager.encumberedBalance(address(token), COMMITTER) == amount);
    }

    /// @notice INV-10 for `createAndFund` with SURPLUS deposit: a larger `depositAmount` than
    ///         `amount` leaves the surplus withdrawable in free balance; encumbered == amount.
    function check_createAndFund_INV10_surplusStaysFree(uint256 amount) public {
        vm.assume(amount >= 1 && amount <= DEPOSIT); // deposit the full DEPOSIT, encumber `amount`

        vm.prank(COMMITTER);
        uint256 id = manager.createAndFund(DEPOSIT, _params(amount));

        assert(id >= 1);
        assert(manager.encumberedBalance(address(token), COMMITTER) == amount);
        assert(manager.freeBalance(address(token), COMMITTER) == DEPOSIT - amount);
    }

    /// @notice INV-10 for `batchCreateCommitments`: a concrete length-2 batch with SYMBOLIC
    ///         amounts returns two ids that are each ≥ 1 and strictly increasing, and encumbers
    ///         EXACTLY the sum (a1 + a2) from the committer's pre-funded free balance.
    /// @dev Length fixed at 2 (concrete) per the harness plan; amounts symbolic. The committer
    ///      is pre-funded with the full DEPOSIT in this check so the batch draws from free balance.
    function check_batchCreate_INV10_idsNonZeroAndEncumberSum(uint256 a1, uint256 a2) public {
        vm.assume(a1 >= 1);
        vm.assume(a2 >= 1);
        vm.assume(a1 <= DEPOSIT);
        vm.assume(a2 <= DEPOSIT - a1); // a1 + a2 <= DEPOSIT, no overflow, batch fully funded

        vm.prank(COMMITTER);
        manager.deposit(address(token), DEPOSIT);

        ICM.CommitmentParams[] memory ps = new ICM.CommitmentParams[](2);
        ps[0] = _params(a1);
        ps[1] = _params(a2);

        vm.prank(COMMITTER);
        uint256[] memory ids = manager.batchCreateCommitments(ps);

        assert(ids.length == 2);
        assert(ids[0] >= 1);
        assert(ids[1] >= 1);
        assert(ids[1] > ids[0]); // monotonically increasing ids
        assert(manager.encumberedBalance(address(token), COMMITTER) == a1 + a2);
        assert(manager.freeBalance(address(token), COMMITTER) == DEPOSIT - a1 - a2);
    }

    /// @notice `createCommitmentFor` (relayer / EIP-712) is a documented GAP for this harness.
    /// @dev The path consumes an EIP-712 digest validated through OZ `SignatureChecker` inside
    ///      the CommitmentLifecycleLib delegatecall. Reproducing a VALID signature under Halmos
    ///      would require binding the domain separator (which mixes in `block.chainid` and the
    ///      proxy address) to a concrete key and reconstructing the exact typed-data encoding —
    ///      the ecrecover would then be over a fully concrete digest, giving no symbolic coverage
    ///      of the create accounting beyond what `createCommitment` already proves. The nonce and
    ///      digest machinery are covered by the Foundry relayer tests; the shared create core
    ///      (`_createCommitmentInternal` → `CommitmentLifecycleLib.createFull`) is exactly the
    ///      code path `createCommitment` and `batchCreateCommitments` exercise symbolically here.
    ///      Left as a no-op placeholder so the gap is visible in the harness surface.
    function check_createCommitmentFor_INV10_signaturePathNote() public pure {
        assert(true);
    }
}
