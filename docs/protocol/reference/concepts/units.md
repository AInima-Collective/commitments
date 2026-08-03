---
title: Units and Constants
status: current
---

# Units and Constants

Always read the declaration and NatSpec for the exact function. This page summarizes conventions shared across the shipped contracts.

## Raw token units

Manager deposit, withdrawal, free balance, encumbered balance, commitment amount, strategy escrow, and agreement settlement are denominated in raw units of the relevant ERC-20 backing token.

Agreement legs may use different tokens. Each directional settlement cap is denominated in the payer leg token.

## Basis points

10,000 basis points equals 100 percent. Fields ending in Bps use this scale, including maxPenaltyBps, portionBps, weightBps, minMaxPenaltyBps, feeBps, and mutual valuation or haircut parameters. Executable generic basis-point arithmetic imports the canonical `BPS_DENOMINATOR` from `src/shared/Constants.sol`.

Exposure is calculated with floor rounding:

~~~text
forfeitableUnits = amount * maxPenaltyBps / 10_000
~~~

Rounding is conservative and the implementation uses before-and-after exposure differences when amounts change so repeated operations do not accumulate accounting drift.

## Adapter index

IBackingAdapter reports indexNow and denomination metadata. ERC20StaticAdapter uses the shared `WAD` value as its fixed 1e18 index. ERC4626Adapter reports the ERC-4626 conversion for `WAD` share units.

An adapter does not move tokens. Distribution strategies use its index according to their own binding rules.

## Fixed-point indices

| Surface | Scale |
|---|---|
| Generic 18-decimal fixed point (`WAD`) | 1e18 |
| Mutual cumulative loss Lambda | 1e18 |
| Mutual premium-per-cover Pi | 1e27 |
| Mesh and policy percentages | basis points, 10,000 |

Generic 18-decimal arithmetic imports `WAD` from `src/shared/Constants.sol`. Mutual cumulative loss deliberately retains the domain-specific name `LAMBDA_ONE` even though it has the same numeric representation: that name makes the fully-attributed-loss invariant explicit. Premium and loss calculations use floor rounding plus explicit remainder or reserve accounting where the standard requires it.

Run `just units-check` to reject new executable raw scale literals. The check ignores documentation and tests and carries an explicit rationale for every permitted source-level definition.

## Time

Durations and timestamps are seconds. Important time values include manager unbonding period, commitment challenge and expiry windows, agreement proposal duration, mutual challenge and deallocation windows, pause budgets, service reference-block policy, and reward root activation delay.

A zero timestamp or duration may be a sentinel on a specific surface; it is not a universal rule. For example commitment expiresAt zero means no fixed expiry, while several configured duration values must be nonzero.

## Identifiers and sentinels

Commitment, agreement, proposal, and mutual identifiers are 1-indexed where documented. Commitment id zero is reserved for non-attributed DistributionPaid vocabulary and must never identify a live commitment. Membership mutualId zero means not a member.

## Addresses and hashes

The zero address is rejected for required actors and tokens. bytes32 values are used for evidence, metadata, denomination, root, and replay identifiers; zero is only a sentinel when the relevant interface says so.
