---
title: Overview
order: 0
status: current
---

# Commitments

## Documentation authority

The shipped Solidity contracts define current protocol behavior, state
transitions, permissions, accounting, ABI, and identifiers. Compiled artifacts
and tests provide mechanical evidence for that implementation. The current
standards formalize it, generated references describe it, and protocol guides
explain how to use it. If a current document disagrees with the contracts, the
document is stale unless a contract change has been explicitly approved.

Draft behavior belongs under `design/` and is not current protocol authority.

Commitments is a Solidity protocol for **on-chain indemnity**: enforceable agreements backed by productive capital. A committer pledges backing tokens into a manager that custodies them under the authority of an arbiter; the arbiter can release the backing or forfeit it to a counterparty, on terms both sides agree to up front. The backing stays productive the whole time. The canonical case is yield-bearing ERC-4626 vault shares, but any ERC-20 works through a pluggable pricing adapter, so the underlying capital keeps earning in its own venue while it stands behind the agreement. Two parties can commit to each other in a single bilateral primitive, an *agreement*, and a mesh layer composes individual commitments into the multi-party stake topologies that restaking, governance, and insurance systems need.

The result is a single primitive expressive enough to back operator stake for an operator service, a yield-share donation to a charity, an insurance policy, or any other agreement where money should be at stake, without each application reinventing custody, forfeiture, and dispute mechanics.

## Why this exists

[ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) standardized yield-bearing vaults but stopped at deposits and withdrawals. There's no shared way to *encumber* tokens as collateral for an agreement while the underlying capital keeps earning. Restaking protocols solved a slice of this problem with bespoke lien mechanisms welded to specific operator/AVS architectures; nothing they built is portable.

Commitments fills that gap. The same primitive that secures a restaked operator can secure a charitable donation, an insurance arrangement, or a treaty between two DAOs. The properties that make it work for one use case (parameterized enforcement, two-phase forfeiture, committer liveness, yield routing) are the same ones that make it work for the others.

## Core primitives

The **manager** is the custody root. Committers deposit backing tokens into it; the manager tracks a per-(token, user) free/encumbered ledger, owns the commitment state machine, and is the sole executor of token movements. Free balance withdraws instantly: it backs nothing.

A **backing adapter** is a stateless pricing lens that makes any ERC-20 usable as backing. For yield-bearing backing, the canonical pattern is an ERC-4626 **vault**: deposit assets into the vault, deposit the *shares* into the manager, and the underlying keeps earning in the vault's pluggable yield strategy while the shares stand behind commitments. The adapter reports the share price (`convertToAssets`) so strategies can measure appreciation.

A **commitment** is a parameterized lien on the committer's encumbered backing. The committer specifies an arbiter, a counterparty, a maximum penalty, and a challenge window; the arbiter can later release or forfeit (two-phase, with payouts delivered as pull-payment credits to the counterparty's free balance). An *exposure allocation* invariant prevents a committer from over-promising the same backing across multiple commitments. A manager-level unbond window guarantees the committer can always exit, even if the arbiter is offline.

A **distribution strategy** is a pluggable contract bound to a commitment at creation that expresses value flows such as yield-share premiums and flat fees as validated token movements the manager executes. Yield-share premiums are themselves a strategy, not a field on the commitment. Strategy hooks run gas-capped and failure-isolated: a broken strategy can never block a release or forfeit. Merkle rewards are paid by the separate Rewards coordinator extension.

An **agreement** is a linked pair of commitments under a shared arbiter: bilateral, with atomic enforcement and symmetric unbond. It's the smallest unit of mutual obligation the protocol can express.

A **mutual** is a many-member coverage pool built from commitments. Each member backs its own share with its own collateral (several liability), while a single shared loss index attributes a covered loss across the pool in one write and each member settles its slice lazily. Premiums stream to members through a separate index, so a pool can price members heterogeneously without changing how losses are shared.

The **mesh** is a topology layer of fan-in, fan-out, and weighting nodes that aggregate stake from many sources, distribute it to many consumers, and normalize multi-asset stake into unified voting power. It's how you turn a pile of individual commitments into the kind of trust graph a governance system or a service marketplace needs.

## What you can build with it

- **Operator stake for a verifiable service.** An operator-service marketplace where operators commit shares to a service manager, which forfeits them for misbehavior.
- **Yield-share donations.** A committer commits shares to a charity; the principal stays theirs, but a slice of yield routes to the cause for as long as the commitment lives.
- **Forfeiture insurance.** An underwriter's shares back a payout if a covered event occurs, arbitrated by an attestation oracle.
- **Bilateral treaties.** Two DAOs stake against each other to enforce a cross-protocol agreement, with no third-party escrow.

These aren't separate products. They're the same contract surface, parameterized differently.

## Where to go next

- **[Standards family](standards/README.md)** maps the core standard and each sibling extension to its interfaces, implementations, dependencies, and conformance tests.
- **[Full protocol docs](protocol/README.md)** cover architecture, generated contract reference, role-based guides, security, deployment, and configuration.
- **Design RFCs** ([marketplace](design/rfcs/marketplace.md), [value display](design/rfcs/value-display.md)) describe proposals that are not current protocol behavior.
