// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {deployManager} from "../../helpers/ManagerTestBase.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding, TokenMovement, MovementKind} from "src/core/interfaces/IDistributionStrategy.sol";
import {MockERC20} from "../../helpers/MockERC20.sol";
import {RecordingStrategy, MOCK_DISTRIBUTE, MOCK_CLAIM} from "../mocks/StrategyMocks.sol";

/// @title ManagerHandler
/// @notice Invariant-fuzz handler for the manager. Grown wave by wave:
///         Wave 1 — deposit / withdraw / fundStrategy.
///         Wave 2 — create / release / expire / forfeit / unbond / time-warp.
///         Wave 3 — distribute / claim through movement-emitting strategies.
///         Wave 4 — agree / settle / contribute / atomic bilateral forfeit & release.
contract ManagerHandler is Test {
    CommitmentManager public manager;
    MockERC20[] public tokens;
    address[] public actors;
    address[] public strategies;
    address public arbiter;

    uint256[] public allCommitmentIds;
    uint256[] public allAgreementIds;

    // Wave 5 — shared-loss mutuals (Mutual). Member member commitments are tracked
    // separately from `allCommitmentIds` so the legacy ops never touch them (they'd revert), and
    // the exposure invariant walks BOTH lists.
    uint256[] public allMutualIds;
    uint256[] public allMutualCommitmentIds;
    address public beneficiary; // a non-member actor that receives settled units (in the ledger walk)

    uint64 internal constant WINDOW = 1 days;
    uint64 internal constant MUTUAL_WINDOW = 2 days;

    constructor(CommitmentManager manager_, MockERC20[] memory tokens_) {
        manager = manager_;
        tokens = tokens_;
        arbiter = makeAddr("handlerArbiter");

        for (uint256 i = 0; i < 5; i++) {
            address actor = makeAddr(string.concat("actor", vm.toString(i)));
            actors.push(actor);
            for (uint256 t = 0; t < tokens_.length; t++) {
                tokens_[t].mint(actor, 1_000_000e18);
                vm.prank(actor);
                tokens_[t].approve(address(manager_), type(uint256).max);
            }
        }
        // Beneficiary is in the actor set (so the ledger walk covers its receipts) but never a
        // committer/counterparty in the legacy ops.
        beneficiary = makeAddr("mutualBeneficiary");
        actors.push(beneficiary);
        for (uint256 i = 0; i < 3; i++) {
            strategies.push(address(new RecordingStrategy()));
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _token(uint256 seed) internal view returns (MockERC20) {
        return tokens[seed % tokens.length];
    }

    // =========================================================================
    // Wave 1 — custody ops
    // =========================================================================

    function deposit(uint256 actorSeed, uint256 tokenSeed, uint256 amount) external {
        address actor = _actor(actorSeed);
        MockERC20 token = _token(tokenSeed);
        if (token.balanceOf(actor) == 0) return;
        amount = bound(amount, 1, token.balanceOf(actor));
        vm.prank(actor);
        manager.deposit(address(token), amount);
    }

    function withdraw(uint256 actorSeed, uint256 tokenSeed, uint256 amount) external {
        address actor = _actor(actorSeed);
        MockERC20 token = _token(tokenSeed);
        uint256 free = manager.freeBalance(address(token), actor);
        if (free == 0) return;
        amount = bound(amount, 1, free);
        vm.prank(actor);
        manager.withdraw(address(token), amount);
    }

    function fundStrategy(uint256 actorSeed, uint256 tokenSeed, uint256 strategySeed, uint256 amount) external {
        address actor = _actor(actorSeed);
        MockERC20 token = _token(tokenSeed);
        amount = bound(amount, 1, 10_000e18);
        if (token.balanceOf(actor) < amount) return;
        vm.prank(actor);
        manager.fundStrategy(strategies[strategySeed % strategies.length], address(token), amount);
    }

    // =========================================================================
    // Wave 2 — commitment lifecycle ops
    // =========================================================================

    function createCommitment(
        uint256 actorSeed,
        uint256 tokenSeed,
        uint256 counterpartySeed,
        uint256 amount,
        uint16 penaltyBps
    ) external {
        address actor = _actor(actorSeed);
        MockERC20 token = _token(tokenSeed);
        uint256 free = manager.freeBalance(address(token), actor);
        if (free == 0) return;
        amount = bound(amount, 1, free);
        penaltyBps = uint16(bound(penaltyBps, 0, 10_000));

        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        // Counterparty stays inside the actor set so the ledger-walk invariant sees forfeit credits.
        p.counterparty = _actor(counterpartySeed);
        p.token = address(token);
        p.adapter = makeAddr("adapter");
        p.amount = amount;
        p.maxPenaltyBps = penaltyBps;
        p.challengeWindow = WINDOW;
        // Every commitment binds one strategy so the movement ops below have a target.
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding(strategies[(actorSeed + tokenSeed) % strategies.length], "");

        vm.prank(actor);
        uint256 id = manager.createCommitment(p);
        allCommitmentIds.push(id);
    }

    // =========================================================================
    // Wave 3 — movement ops through bound strategies
    // =========================================================================

    /// @dev Accrue a bounded slice of the committer's encumbered position into the bound
    ///      strategy's escrow (FromEncumberedToEscrow via distribute).
    function distributeToEscrow(uint256 idSeed, uint256 units) external {
        (bool ok, uint256 id) = _pickActive(idSeed);
        if (!ok) return;
        ICM.ForfeitProposal memory p = manager.getForfeitProposal(id);
        if (p.initiatedAt != 0 && !p.cancelled && !p.executed) return;

        ICM.Commitment memory c = manager.getCommitment(id);
        if (c.amount == 0) return;
        units = bound(units, 1, c.amount);

        address strategy = manager.strategiesOf(id)[0];
        TokenMovement[] memory moves = new TokenMovement[](1);
        moves[0] = TokenMovement(MovementKind.FromEncumberedToEscrow, c.committer, strategy, c.token, units);
        RecordingStrategy(strategy).setMoves(MOCK_DISTRIBUTE, moves);
        manager.distribute(id, strategy);
        RecordingStrategy(strategy).setMoves(MOCK_DISTRIBUTE, new TokenMovement[](0));
    }

    /// @dev Pay a bounded slice of the strategy's escrow to the counterparty's free balance
    ///      (FromEscrowToFree via claim). Works on open and closed commitments alike.
    function claimFromEscrow(uint256 idSeed, uint256 units) external {
        uint256 n = allCommitmentIds.length;
        if (n == 0) return;
        uint256 id = allCommitmentIds[idSeed % n];
        ICM.Commitment memory c = manager.getCommitment(id);

        address strategy = manager.strategiesOf(id)[0];
        uint256 escrowBal = manager.escrowOf(c.token, strategy);
        if (escrowBal == 0) return;
        units = bound(units, 1, escrowBal);

        TokenMovement[] memory moves = new TokenMovement[](1);
        moves[0] = TokenMovement(MovementKind.FromEscrowToFree, strategy, c.counterparty, c.token, units);
        RecordingStrategy(strategy).setMoves(MOCK_CLAIM, moves);
        manager.claim(id, strategy, "");
        RecordingStrategy(strategy).setMoves(MOCK_CLAIM, new TokenMovement[](0));
    }

    function releaseCommitment(uint256 idSeed) external {
        (bool ok, uint256 id) = _pickActive(idSeed);
        if (!ok) return;
        if (manager.agreementOf(id) != 0) return; // agreed legs use the bilateral path
        vm.prank(arbiter);
        manager.releaseCommitment(id);
    }

    function initiateForfeit(uint256 idSeed, uint16 penaltyBps) external {
        (bool ok, uint256 id) = _pickActive(idSeed);
        if (!ok) return;
        if (manager.agreementOf(id) != 0) return;
        ICM.Commitment memory c = manager.getCommitment(id);
        ICM.ForfeitProposal memory p = manager.getForfeitProposal(id);
        if (p.initiatedAt != 0 && !p.cancelled && !p.executed) return;
        vm.prank(arbiter);
        manager.initiateForfeit(id, uint16(bound(penaltyBps, 0, c.maxPenaltyBps)));
    }

    function executeForfeit(uint256 idSeed) external {
        (bool ok, uint256 id) = _pickActive(idSeed);
        if (!ok) return;
        ICM.ForfeitProposal memory p = manager.getForfeitProposal(id);
        if (p.initiatedAt == 0 || p.cancelled || p.executed) return;
        ICM.Commitment memory c = manager.getCommitment(id);
        vm.warp(uint256(p.initiatedAt) + uint256(c.challengeWindow) + 1);
        manager.executeForfeit(id);
    }

    function cancelForfeit(uint256 idSeed) external {
        (bool ok, uint256 id) = _pickActive(idSeed);
        if (!ok) return;
        ICM.ForfeitProposal memory p = manager.getForfeitProposal(id);
        if (p.initiatedAt == 0 || p.cancelled || p.executed) return;
        vm.prank(arbiter);
        manager.cancelForfeit(id);
    }

    function requestUnbond(uint256 idSeed) external {
        (bool ok, uint256 id) = _pickActive(idSeed);
        if (!ok) return;
        if (manager.unbondInitiatedAt(id) != 0) return;
        vm.prank(manager.getCommitment(id).committer);
        manager.requestUnbond(id);
    }

    function finalizeUnbond(uint256 idSeed) external {
        (bool ok, uint256 id) = _pickActive(idSeed);
        if (!ok) return;
        uint64 initiatedAt = manager.unbondInitiatedAt(id);
        if (initiatedAt == 0) return;
        ICM.ForfeitProposal memory p = manager.getForfeitProposal(id);
        if (p.initiatedAt != 0 && !p.cancelled && !p.executed) return;
        vm.warp(uint256(initiatedAt) + uint256(manager.unbondingPeriod()) + 1);
        manager.finalizeUnbond(id);
    }

    // =========================================================================
    // Wave 4 — agreements, settlement, contributions
    // =========================================================================

    function agree(uint256 proposerSeed, uint256 acceptorSeed, uint256 tokenSeed, uint256 amountSeed, uint128 capSeed)
        external
    {
        address proposer = _actor(proposerSeed);
        address acceptor = _actor(acceptorSeed);
        if (proposer == acceptor) return;
        _doAgree(proposer, acceptor, _token(tokenSeed), amountSeed, capSeed);
    }

    function _doAgree(address proposer, address acceptor, MockERC20 token, uint256 amountSeed, uint128 capSeed)
        private
    {
        uint256 freeA = manager.freeBalance(address(token), proposer);
        uint256 freeB = manager.freeBalance(address(token), acceptor);
        if (freeA == 0 || freeB == 0) return;

        StrategyBinding[] memory binds = new StrategyBinding[](1);
        binds[0] = StrategyBinding(strategies[amountSeed % strategies.length], "");
        uint16 bps = uint16(bound(amountSeed >> 16, 0, 10_000));

        ICM.AgreementParams memory p;
        p.arbiter = arbiter;
        p.acceptor = acceptor;
        // Same token/adapter on both legs; the partition invariant is checked per token.
        p.proposerLeg = ICM.LegTerms(address(token), makeAddr("adapter"), bound(amountSeed, 1, freeA), bps, binds);
        p.acceptorLeg = ICM.LegTerms(
            address(token), makeAddr("adapter"), bound(uint256(keccak256(abi.encode(amountSeed))), 1, freeB), bps, binds
        );
        p.challengeWindow = WINDOW;
        p.proposalDuration = 7 days;
        p.maxFlowProposerToAcceptor = uint128(bound(capSeed, 0, 1_000e18));
        p.maxFlowAcceptorToProposer = uint128(bound(uint256(capSeed) / 3, 0, 1_000e18));

        vm.prank(proposer);
        uint256 proposalId = manager.proposeAgreement(p);
        vm.prank(acceptor);
        (uint256 agreementId,,) = manager.acceptAgreement(proposalId);

        (uint256 cidA, uint256 cidB) = manager.getAgreementPair(agreementId);
        allCommitmentIds.push(cidA);
        allCommitmentIds.push(cidB);
        allAgreementIds.push(agreementId);
    }

    function settle(uint256 entSeed, bool fromProposer, uint256 units) external {
        uint256 n = allAgreementIds.length;
        if (n == 0) return;
        uint256 agreementId = allAgreementIds[entSeed % n];
        (uint256 cidA, uint256 cidB) = manager.getAgreementPair(agreementId);
        if (!_settleable(cidA) || !_settleable(cidB)) return;

        uint256 maxUnits = _settleHeadroom(agreementId, fromProposer, fromProposer ? cidA : cidB);
        if (maxUnits == 0) return;

        vm.prank(arbiter);
        manager.settleAgreement(agreementId, fromProposer, bound(units, 1, maxUnits), bytes32(0));
    }

    function _settleHeadroom(uint256 agreementId, bool fromProposer, uint256 payerCid) internal view returns (uint256) {
        (uint128 maxPToA, uint128 maxAToP, uint128 cumulPToA, uint128 cumulAToP) =
            manager.getAgreementSettlement(agreementId);
        uint256 capLeft = fromProposer ? maxPToA - cumulPToA : maxAToP - cumulAToP;
        uint256 payerAmount = manager.getCommitment(payerCid).amount;
        return capLeft < payerAmount ? capLeft : payerAmount;
    }

    function _settleable(uint256 id) internal view returns (bool) {
        ICM.Commitment memory c = manager.getCommitment(id);
        if (c.released || c.forfeited) return false;
        ICM.ForfeitProposal memory p = manager.getForfeitProposal(id);
        if (p.initiatedAt != 0 && !p.cancelled && !p.executed) return false;
        if (manager.unbondInitiatedAt(id) != 0) return false;
        return true;
    }

    function forfeitAgreement(uint256 entSeed) external {
        uint256 n = allAgreementIds.length;
        if (n == 0) return;
        uint256 agreementId = allAgreementIds[entSeed % n];
        (uint256 cidA, uint256 cidB) = manager.getAgreementPair(agreementId);
        ICM.Commitment memory cA = manager.getCommitment(cidA);
        ICM.Commitment memory cB = manager.getCommitment(cidB);
        if ((cA.released || cA.forfeited) && (cB.released || cB.forfeited)) return;
        vm.prank(arbiter);
        manager.forfeitAgreement(agreementId, cA.maxPenaltyBps);
    }

    function releaseAgreement(uint256 entSeed) external {
        uint256 n = allAgreementIds.length;
        if (n == 0) return;
        uint256 agreementId = allAgreementIds[entSeed % n];
        (uint256 cidA, uint256 cidB) = manager.getAgreementPair(agreementId);
        ICM.Commitment memory cA = manager.getCommitment(cidA);
        ICM.Commitment memory cB = manager.getCommitment(cidB);
        if ((cA.released || cA.forfeited) && (cB.released || cB.forfeited)) return;
        vm.prank(arbiter);
        manager.releaseAgreement(agreementId);
    }

    function contribute(uint256 idSeed, uint256 contributorSeed, uint256 units) external {
        (bool ok, uint256 id) = _pickActive(idSeed);
        if (!ok) return;
        if (!_settleable(id)) return; // same guards: no forfeit, no unbond
        ICM.Commitment memory c = manager.getCommitment(id);

        // Committer's own first contribution opts the commitment in.
        uint256 committerFree = manager.freeBalance(c.token, c.committer);
        if (committerFree == 0) return;
        vm.prank(c.committer);
        manager.contributeEncumbered(id, 1);

        address contributor = _actor(contributorSeed);
        uint256 free = manager.freeBalance(c.token, contributor);
        if (free == 0) return;
        vm.prank(contributor);
        manager.contributeEncumbered(id, bound(units, 1, free));
    }

    // =========================================================================
    // Wave 5 — shared-loss mutuals (Mutual)
    // =========================================================================

    function createMutual(uint256 tokenSeed) external {
        MockERC20 token = _token(tokenSeed);
        ICM.MutualParams memory p = ICM.MutualParams({
            arbiter: arbiter,
            numeraire: address(token),
            beneficiary: beneficiary,
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        uint256 gid = manager.createMutual(p);
        vm.prank(arbiter);
        manager.activateMutual(gid);
        allMutualIds.push(gid);
    }

    function joinMutual(uint256 actorSeed, uint256 mutualSeed, uint256 amount, uint16 bps) external {
        if (allMutualIds.length == 0) return;
        uint256 gid = allMutualIds[mutualSeed % allMutualIds.length];
        ICM.Mutual memory g = manager.getMutual(gid);
        if (!g.active || g.terminal || _mutualLossPending(gid)) return;

        address actor = _actor(actorSeed);
        if (actor == beneficiary) return; // no forfeit-to-self in the fuzz
        uint256 free = manager.freeBalance(g.numeraire, actor);
        if (free == 0) return;
        amount = bound(amount, 1, free);
        bps = uint16(bound(bps, 1, 10_000));
        if (amount * bps < 10_000) return; // need E_i > 0

        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = beneficiary;
        p.token = g.numeraire;
        p.adapter = makeAddr("adapter");
        p.amount = amount;
        p.maxPenaltyBps = bps;
        p.challengeWindow = WINDOW;
        p.strategies = new StrategyBinding[](0);

        vm.prank(actor);
        uint256 cid = manager.joinMutual(gid, p);
        allMutualCommitmentIds.push(cid);
    }

    function initiateMutualLoss(uint256 mutualSeed, uint256 lossSeed) external {
        if (allMutualIds.length == 0) return;
        uint256 gid = allMutualIds[mutualSeed % allMutualIds.length];
        ICM.Mutual memory g = manager.getMutual(gid);
        if (!g.active || g.terminal || g.totalShares == 0 || _mutualLossPending(gid)) return;
        uint64 lastAt = manager.getMutualLossProposal(gid).initiatedAt;
        if (lastAt != 0 && block.timestamp < uint256(lastAt) + 1 hours) return;
        uint256 loss = bound(lossSeed, 1, uint256(g.totalShares) * 2); // may exceed shares -> exercises the clamp
        vm.prank(arbiter);
        manager.initiateMutualLoss(gid, loss, bytes32(0));
    }

    function executeMutualLoss(uint256 mutualSeed) external {
        if (allMutualIds.length == 0) return;
        uint256 gid = allMutualIds[mutualSeed % allMutualIds.length];
        ICM.MutualLossProposal memory p = manager.getMutualLossProposal(gid);
        if (p.initiatedAt == 0 || p.executed || p.cancelled) return;
        ICM.Mutual memory g = manager.getMutual(gid);
        vm.warp(uint256(p.initiatedAt) + g.challengeWindow + 1);
        manager.executeMutualLoss(gid);
    }

    function cancelMutualLoss(uint256 mutualSeed) external {
        if (allMutualIds.length == 0) return;
        uint256 gid = allMutualIds[mutualSeed % allMutualIds.length];
        ICM.MutualLossProposal memory p = manager.getMutualLossProposal(gid);
        if (p.initiatedAt == 0 || p.executed || p.cancelled) return;
        vm.prank(arbiter);
        manager.cancelMutualLoss(gid);
    }

    function settleMember(uint256 cidSeed) external {
        if (allMutualCommitmentIds.length == 0) return;
        uint256 cid = allMutualCommitmentIds[cidSeed % allMutualCommitmentIds.length];
        if (manager.getMembership(cid).mutualId == 0) return; // released
        manager.settleMemberLoss(cid);
    }

    function requestMutualExit(uint256 cidSeed) external {
        if (allMutualCommitmentIds.length == 0) return;
        uint256 cid = allMutualCommitmentIds[cidSeed % allMutualCommitmentIds.length];
        ICM.Membership memory m = manager.getMembership(cid);
        if (m.mutualId == 0 || m.unbondRequestedAt != 0 || _mutualLossPending(m.mutualId)) return;
        vm.prank(manager.getCommitment(cid).committer);
        manager.requestMutualExit(cid);
    }

    function releaseMutualMember(uint256 cidSeed) external {
        if (allMutualCommitmentIds.length == 0) return;
        uint256 cid = allMutualCommitmentIds[cidSeed % allMutualCommitmentIds.length];
        ICM.Membership memory m = manager.getMembership(cid);
        if (m.mutualId == 0 || m.unbondRequestedAt == 0 || _mutualLossPending(m.mutualId)) return;
        ICM.Mutual memory g = manager.getMutual(m.mutualId);
        if (m.lossSnapshot != g.cumulativeLoss) manager.settleMemberLoss(cid); // settle outstanding first
        vm.warp(uint256(m.unbondRequestedAt) + g.deallocationWindow + 1);
        manager.releaseMutualMember(cid);
    }

    // ---- Wave 5b — premium index (reward side) ----

    /// @dev A policyholder funds a mutual's premium stream from its WALLET (measured-receipt pull).
    ///      Guarded on `activeCover != 0` so it never trips NoActiveCover; the funding-time solvency
    ///      guard is exercised on every successful call. Live-stream top-ups are grown to the S6
    ///      rate-non-decrease floor so the guard never rejects them.
    function fundPremium(uint256 mutualSeed, uint256 funderSeed, uint256 amount, uint64 dur) external {
        if (allMutualIds.length == 0) return;
        uint256 gid = allMutualIds[mutualSeed % allMutualIds.length];
        ICM.Mutual memory g = manager.getMutual(gid);
        if (g.terminal) return;
        (, uint128 activeCover,, uint128 rate,, uint64 finish,,,) = manager.getMutualPremiumState(gid);
        if (activeCover == 0) return;

        address funder = _actor(funderSeed);
        if (funder == beneficiary) return;
        MockERC20 num = MockERC20(g.numeraire);
        uint256 wallet = num.balanceOf(funder);
        if (wallet == 0) return;
        amount = bound(amount, 1, wallet);
        dur = uint64(bound(uint256(dur), 1 minutes, 30 days));
        if (block.timestamp < finish) {
            // S6 guard: while a stream is live the rate may only be maintained or raised. Fund at
            // least the amount that keeps `newRate >= rate`, or skip if unaffordable.
            uint256 leftover = (uint256(finish) - block.timestamp) * uint256(rate);
            uint256 target = uint256(rate) * uint256(dur);
            if (target > leftover) {
                uint256 needed = target - leftover; // funding floor that keeps the rate
                if (needed > amount) amount = needed;
                if (amount > wallet) return; // funder can't afford a guard-compliant top-up
            }
        }
        vm.prank(funder);
        manager.fundMutualPremium(gid, amount, dur);
    }

    function claimPremium(uint256 cidSeed) external {
        if (allMutualCommitmentIds.length == 0) return;
        uint256 cid = allMutualCommitmentIds[cidSeed % allMutualCommitmentIds.length];
        if (manager.getMembership(cid).mutualId == 0) return;
        manager.claimMemberPremium(cid);
    }

    function reclaimPremium(uint256 mutualSeed) external {
        if (allMutualIds.length == 0) return;
        uint256 gid = allMutualIds[mutualSeed % allMutualIds.length];
        if (manager.getMutual(gid).arbiter == address(0)) return;
        vm.prank(beneficiary);
        manager.reclaimPremium(gid);
    }

    function _mutualLossPending(uint256 mutualId) internal view returns (bool) {
        ICM.MutualLossProposal memory p = manager.getMutualLossProposal(mutualId);
        return p.initiatedAt != 0 && !p.executed && !p.cancelled;
    }

    function mutualCount() external view returns (uint256) {
        return allMutualIds.length;
    }

    function mutualCommitmentCount() external view returns (uint256) {
        return allMutualCommitmentIds.length;
    }

    /// @dev Picks an active (not released/forfeited) commitment from the ghost list.
    function _pickActive(uint256 seed) internal view returns (bool, uint256) {
        uint256 n = allCommitmentIds.length;
        if (n == 0) return (false, 0);
        for (uint256 i = 0; i < n && i < 8; i++) {
            uint256 id = allCommitmentIds[(seed + i) % n];
            ICM.Commitment memory c = manager.getCommitment(id);
            if (!c.released && !c.forfeited) return (true, id);
        }
        return (false, 0);
    }

    // ---- introspection for the invariant assertions ----

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function strategyCount() external view returns (uint256) {
        return strategies.length;
    }

    function commitmentCount() external view returns (uint256) {
        return allCommitmentIds.length;
    }

    function agreementCount() external view returns (uint256) {
        return allAgreementIds.length;
    }
}

/// @title PartitionInvariantTest
/// @notice INV-1 (partition), INV-2 (ledger consistency), INV-3 (exposure) asserted across
///         randomized custody + lifecycle sequences. The partition is checked two ways —
///         against the O(1) aggregates and against a full ledger walk — so the aggregate
///         counters are themselves proven consistent.
contract PartitionInvariantTest is Test {
    CommitmentManager internal manager;
    ManagerHandler internal handler;
    MockERC20[] internal tokens;

    function setUp() public {
        manager = deployManager(makeAddr("admin"), 7 days, 14 days);

        tokens.push(new MockERC20("Backing A", "BCKA", 18));
        tokens.push(new MockERC20("Backing B", "BCKB", 6));

        handler = new ManagerHandler(manager, tokens);
        targetContract(address(handler));
    }

    /// @dev INV-1 / INV-P1 (extended partition): the four compartments — free + encumbered + escrow +
    ///      mutualPremiumPool — sum to the manager's real token balance. The premium reserve
    ///      (`funded − claimed`) is the fourth compartment; the manager custodies funded numeraire that
    ///      belongs to no actor's free/encumbered balance, so the partition only closes once it is added in.
    function invariant_partition_aggregatesMatchBalance() public view {
        for (uint256 t = 0; t < tokens.length; t++) {
            address token = address(tokens[t]);
            (uint256 free, uint256 enc, uint256 esc, uint256 mp) = manager.ledgerTotals(token);
            assertEq(mp, _mutualPremiumForToken(token), "totalMutualPremium == sum of pools");
            assertEq(free + enc + esc + mp, tokens[t].balanceOf(address(manager)), "INV-P1: 4-compartment partition");
        }
    }

    /// @dev Σ mutualPremiumPool over mutuals whose numeraire == `token` (== totalMutualPremium[token]).
    function _mutualPremiumForToken(address token) internal view returns (uint256 sum) {
        uint256 n = handler.mutualCount();
        for (uint256 i = 0; i < n; i++) {
            uint256 gid = handler.allMutualIds(i);
            if (manager.getMutual(gid).numeraire != token) continue;
            (,,,,,,,, uint256 pool) = manager.getMutualPremiumState(gid);
            sum += pool;
        }
    }

    /// @dev INV-P9 (exact, dual-tracked) + Belt-2 inert, as a live conformance property: for every
    ///      shared-loss mutual, `activeCover == totalShares − settledTotal == Σ_i effCover_i`, and the
    ///      Belt-2 `min(E_i − settled, c.amount)` clamp never bites (the remaining
    ///      liability is always fully deliverable). This leans on the per-(token,user) identity
    ///      `encumbered == Σ c.amount` locked in invariant_exposureAndLedgerConsistency.
    function invariant_premiumActiveCoverExact() public view {
        uint256 nMutuals = handler.mutualCount();
        uint256 nMutualCommitments = handler.mutualCommitmentCount();
        for (uint256 gi = 0; gi < nMutuals; gi++) {
            uint256 gid = handler.allMutualIds(gi);
            (, uint128 activeCover, uint256 settledTotal,,,,,,) = manager.getMutualPremiumState(gid);
            ICM.Mutual memory g = manager.getMutual(gid);
            // INV-P9: activeCover == totalShares − settledTotal.
            assertEq(
                uint256(activeCover),
                uint256(g.totalShares) - settledTotal,
                "INV-P9: activeCover == totalShares - settledTotal"
            );

            // ...and == Σ effCover, with the Belt-2 deliverable clamp inert (the remaining liability is
            // always fully deliverable, so effCover_i == E_i − settled_i).
            uint256 sumEff;
            for (uint256 ci = 0; ci < nMutualCommitments; ci++) {
                uint256 cid = handler.allMutualCommitmentIds(ci);
                ICM.Membership memory m = manager.getMembership(cid);
                if (m.mutualId != gid || m.forfeitableUnits == 0) continue;
                uint256 deliverable = m.forfeitableUnits - m.settledUnits;
                uint256 amt = manager.getCommitment(cid).amount;
                assertLe(deliverable, amt, "INV-P9: Belt-2 clamp inert (deliverable <= c.amount)");
                sumEff += deliverable;
            }
            assertEq(uint256(activeCover), sumEff, "INV-P9: activeCover == sum effCover");
        }
    }

    /// @dev INV-1 cross-check: aggregates vs a full walk of the actor/strategy sets.
    function invariant_partition_aggregatesMatchLedgerWalk() public view {
        for (uint256 t = 0; t < tokens.length; t++) {
            address token = address(tokens[t]);
            uint256 sumFree;
            uint256 sumEnc;
            for (uint256 a = 0; a < handler.actorCount(); a++) {
                address actor = handler.actors(a);
                sumFree += manager.freeBalance(token, actor);
                sumEnc += manager.encumberedBalance(token, actor);
            }
            uint256 sumEsc;
            for (uint256 sIdx = 0; sIdx < handler.strategyCount(); sIdx++) {
                sumEsc += manager.escrowOf(token, handler.strategies(sIdx));
            }
            (uint256 free, uint256 enc, uint256 esc,) = manager.ledgerTotals(token);
            assertEq(sumFree, free, "totalFree consistent with ledger walk");
            assertEq(sumEnc, enc, "totalEncumbered consistent with ledger walk");
            assertEq(sumEsc, esc, "totalEscrow consistent with ledger walk");
        }
    }

    /// @dev INV-2 + INV-3: per (actor, token), the exposure aggregates equal the sums over
    ///      active commitments, the ledger's encumbered balance matches, and
    ///      totalForfeitable ≤ totalEncumbered.
    function invariant_exposureAndLedgerConsistency() public view {
        uint256 nCommitments = handler.commitmentCount();
        for (uint256 a = 0; a < handler.actorCount(); a++) {
            address actor = handler.actors(a);
            for (uint256 t = 0; t < tokens.length; t++) {
                address token = address(tokens[t]);

                uint256 sumAmount;
                uint256 sumExposure;
                for (uint256 i = 0; i < nCommitments; i++) {
                    ICM.Commitment memory c = manager.getCommitment(handler.allCommitmentIds(i));
                    if (c.committer != actor || c.token != token || c.released || c.forfeited) continue;
                    sumAmount += c.amount;
                    sumExposure += (c.amount * c.maxPenaltyBps) / 10_000;
                }
                // Member commitments contribute their RESIDUAL amount and their REMAINING mutual
                // liability `E_i − settledUnits` (not the bps-derived exposure — that is precisely
                // the OBJ-1 surviving-partial-forfeit accounting).
                uint256 nMutual = handler.mutualCommitmentCount();
                for (uint256 i = 0; i < nMutual; i++) {
                    uint256 cid = handler.allMutualCommitmentIds(i);
                    ICM.Commitment memory c = manager.getCommitment(cid);
                    if (c.committer != actor || c.token != token || c.released || c.forfeited) continue;
                    ICM.Membership memory m = manager.getMembership(cid);
                    if (m.mutualId == 0) continue;
                    sumAmount += c.amount;
                    sumExposure += (m.forfeitableUnits - m.settledUnits);
                }

                ICM.UserExposure memory mag = manager.getUserExposure(token, actor);
                assertEq(mag.totalEncumbered, sumAmount, "INV-2: totalEncumbered == sum of active amounts");
                assertEq(mag.totalForfeitable, sumExposure, "exposure-diff rule: totalForfeitable exact");
                assertEq(
                    manager.encumberedBalance(token, actor),
                    sumAmount,
                    "INV-2: ledger encumbered == sum of active amounts"
                );
                assertLe(mag.totalForfeitable, mag.totalEncumbered, "INV-3: exposure allocation");
            }
        }
    }

    /// @dev INV-G2/G3/G6/totalShares: for every shared-loss mutual, Lambda is in [0, 1e18];
    ///      `totalShares` equals the sum of active members' frozen `forfeitableUnits` (E_i); and per member
    ///      cumulative `settledUnits <= forfeitableUnits` (E_i).
    function invariant_mutualAccounting() public view {
        uint256 nMutuals = handler.mutualCount();
        uint256 nMutualCommitments = handler.mutualCommitmentCount();
        for (uint256 gi = 0; gi < nMutuals; gi++) {
            uint256 gid = handler.allMutualIds(gi);
            ICM.Mutual memory g = manager.getMutual(gid);
            assertLe(g.cumulativeLoss, 1e18, "INV-G2: Lambda <= 1e18");

            uint256 sumCredited;
            for (uint256 ci = 0; ci < nMutualCommitments; ci++) {
                uint256 cid = handler.allMutualCommitmentIds(ci);
                ICM.Membership memory m = manager.getMembership(cid);
                if (m.mutualId != gid) continue;
                assertLe(m.settledUnits, m.forfeitableUnits, "INV-G3: settled <= E_i");
                sumCredited += m.forfeitableUnits;
            }
            assertEq(uint256(g.totalShares), sumCredited, "totalShares == sum of active E_i");
        }
    }

    /// @dev INV-E1: per agreement and direction, cumulative settled flow never exceeds the
    ///      lifetime cap consented to at proposal time.
    function invariant_bilateralFlowBound() public view {
        uint256 n = handler.agreementCount();
        for (uint256 i = 0; i < n; i++) {
            (uint128 maxPToA, uint128 maxAToP, uint128 cumulPToA, uint128 cumulAToP) =
                manager.getAgreementSettlement(handler.allAgreementIds(i));
            assertLe(cumulPToA, maxPToA == 0 ? 0 : maxPToA, "INV-E1: proposer->acceptor flow bound");
            assertLe(cumulAToP, maxAToP == 0 ? 0 : maxAToP, "INV-E1: acceptor->proposer flow bound");
        }
    }
}
