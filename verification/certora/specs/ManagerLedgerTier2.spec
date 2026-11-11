/*
 * ManagerLedgerTier2.spec — the tier-2 "ledger walk"
 * (discharges the tier-2 assumption noted in ManagerLedger.spec).
 *
 * Tier 1 (ManagerLedger.spec) proved the four O(1) per-token aggregates
 * partition the manager's token balance. Tier 2 closes the remaining gap
 * between the aggregates and the per-user/per-strategy maps they claim to
 * summarize: ghost sums, maintained by storage hooks on the EIP-7201
 * namespaced ledger, equal the aggregates after every method.
 *
 *   sumFree       == totalFree[backing]        (Σ over users of ledger.free)
 *   sumEncumbered == totalEncumbered[backing]  (Σ over users of ledger.encumbered)
 *   sumEscrow     == totalEscrow[backing]      (Σ over strategies of escrow)
 *
 * With the walk proven, P0-FREE's `freeBalance(u) <= totalFree` assumption is
 * discharged: every ledger entry is a uint256 (non-negative), so the aggregate
 * — being exactly the sum of the entries — dominates each entry. That final
 * arithmetic step (Σ of non-negatives >= any term) lives at the meta level;
 * the machine-checked content is the walk equality itself plus the
 * mirror-consistency invariant tying the ghost entries to the real ledger.
 *
 * Storage hooks use slot patterns because the layout is EIP-7201 namespaced
 * (fields are not top-level Solidity state variables). Base slot is
 * CommitmentManagerStorage.STORAGE_SLOT; the ledger mapping sits at offset 0,
 * escrow at +1 (see CommitmentManagerStorage.sol Part A). TokenLedger packs
 * free at word 0 and encumbered at word 1 of the struct.
 */

using DummyERC20 as backing;

methods {
    function totalFreeOf(address) external returns (uint256) envfree;
    function totalEncumberedOf(address) external returns (uint256) envfree;
    function totalEscrowOf(address) external returns (uint256) envfree;
    function freeBalance(address, address) external returns (uint256) envfree;
    function encumberedBalance(address, address) external returns (uint256) envfree;
    function escrowOf(address, address) external returns (uint256) envfree;

    // Token model (standard scene)
    function backing.balanceOf(address) external returns (uint256) envfree;
    function _.transfer(address, uint256) external => DISPATCHER(true);
    function _.transferFrom(address, address, uint256) external => DISPATCHER(true);
    function _.balanceOf(address) external => DISPATCHER(true);
    function _.permit(address, address, uint256, uint256, uint8, bytes32, bytes32) external => NONDET;

    // Unresolved-call routing (run-260713 triage, family A): OZ v5 SafeERC20's
    // assembly-built token call defeats static sighash matching and fell to
    // AUTO havoc — clobbering the (then non-persistent) ghosts inside plain
    // deposit. Same justification as ManagerLedger.spec.
    unresolved external in _._ => DISPATCH [
        backing.transfer(address, uint256),
        backing.transferFrom(address, address, uint256),
        backing.balanceOf(address)
    ] default NONDET;
}

// CommitmentManagerStorage.STORAGE_SLOT =
// 0x088c82aa976aa63e8a80c9839988524f50fb04228a27fd9edf26e1e6206df800
// = 3866763203897150159042273795063133065266226847991599374840994732078397257728 (ledger)
// escrow mapping is the next field: base + 1.

// --- ghost state -----------------------------------------------------------
// All ghosts are `persistent`: they model MANAGER STORAGE, which no external
// call can mutate (state-mutating reentry is blocked by the real transient
// guard in scene), so a summarized/havoc'd external call must not clobber
// them (run-260713 triage family A: non-persistent ghosts were havoc'd by the
// AUTO-summarized SafeERC20 call inside plain deposit).

persistent ghost mathint sumFree {
    init_state axiom sumFree == 0;
}

persistent ghost mathint sumEncumbered {
    init_state axiom sumEncumbered == 0;
}

persistent ghost mathint sumEscrow {
    init_state axiom sumEscrow == 0;
}

/// Mirrors of the per-user ledger entries for the backing token (ties the
/// ghost sums to the real storage — see mirrorConsistency*).
persistent ghost mapping(address => uint256) gFree {
    init_state axiom forall address u. gFree[u] == 0;
}

persistent ghost mapping(address => uint256) gEncumbered {
    init_state axiom forall address u. gEncumbered[u] == 0;
}

// --- hooks on the EIP-7201 ledger ------------------------------------------

// ledger[token][user].freeBalance (struct word 0)
hook Sstore currentContract.(slot 3866763203897150159042273795063133065266226847991599374840994732078397257728)[KEY address token][KEY address user].(offset 0) uint256 newVal (uint256 oldVal) {
    if (token == backing) {
        sumFree = sumFree + newVal - oldVal;
        gFree[user] = newVal;
    }
}

// ledger[token][user].encumberedBalance (struct word 1 = byte offset 32)
hook Sstore currentContract.(slot 3866763203897150159042273795063133065266226847991599374840994732078397257728)[KEY address token][KEY address user].(offset 32) uint256 newVal (uint256 oldVal) {
    if (token == backing) {
        sumEncumbered = sumEncumbered + newVal - oldVal;
        gEncumbered[user] = newVal;
    }
}

// escrow[strategy][token] (field offset 1 after the ledger mapping)
hook Sstore currentContract.(slot 3866763203897150159042273795063133065266226847991599374840994732078397257729)[KEY address strategy][KEY address token] uint256 newVal (uint256 oldVal) {
    if (token == backing) {
        sumEscrow = sumEscrow + newVal - oldVal;
    }
}

// --- the walk: ghost sums equal the O(1) aggregates -------------------------

invariant freeWalk()
    sumFree == to_mathint(totalFreeOf(backing))
    filtered {
        // Family F: upgradeToAndCall delegatecalls into a symbolic
        // implementation and havocs all storage (ManagerSmoke precedent).
        f -> f.selector != sig:upgradeToAndCall(address, bytes).selector
    }
    {
        preserved with (env e) {
            require e.msg.sender != currentContract; // same reachability assumption as tier 1
        }
    }

invariant encumberedWalk()
    sumEncumbered == to_mathint(totalEncumberedOf(backing))
    filtered {
        // Family F: upgradeToAndCall delegatecalls into a symbolic
        // implementation and havocs all storage (ManagerSmoke precedent).
        f -> f.selector != sig:upgradeToAndCall(address, bytes).selector
    }
    {
        preserved with (env e) {
            require e.msg.sender != currentContract;
        }
    }

invariant escrowWalk()
    sumEscrow == to_mathint(totalEscrowOf(backing))
    filtered {
        // Family F: upgradeToAndCall delegatecalls into a symbolic
        // implementation and havocs all storage (ManagerSmoke precedent).
        f -> f.selector != sig:upgradeToAndCall(address, bytes).selector
    }
    {
        preserved with (env e) {
            require e.msg.sender != currentContract;
        }
    }

// --- mirror consistency: the ghosts track the real ledger -------------------

invariant mirrorConsistencyFree(address user)
    gFree[user] == freeBalance(backing, user)
    filtered {
        // Family F: upgradeToAndCall delegatecalls into a symbolic
        // implementation and havocs all storage (ManagerSmoke precedent).
        f -> f.selector != sig:upgradeToAndCall(address, bytes).selector
    }
    {
        preserved with (env e) {
            require e.msg.sender != currentContract;
        }
    }

invariant mirrorConsistencyEncumbered(address user)
    gEncumbered[user] == encumberedBalance(backing, user)
    filtered {
        // Family F: upgradeToAndCall delegatecalls into a symbolic
        // implementation and havocs all storage (ManagerSmoke precedent).
        f -> f.selector != sig:upgradeToAndCall(address, bytes).selector
    }
    {
        preserved with (env e) {
            require e.msg.sender != currentContract;
        }
    }
