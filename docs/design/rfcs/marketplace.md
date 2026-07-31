---
title: A permissionless marketplace for commitments
status: draft
---

# RFC: A permissionless marketplace for commitments

No general marketplace router is shipped. The frontend may present curated opportunities, but that catalog is not an on-chain marketplace protocol.

## Goal

Allow a maker to publish signed commitment or agreement terms that a taker can discover and fill without giving a router discretionary custody authority.

The current manager supplies useful building blocks:

- createCommitmentFor verifies an EIP-712 authorization and consumes a committer nonce;
- invalidateCreateAuthorization revokes outstanding signatures by advancing that nonce;
- depositFor can fund another user manager balance;
- AgreementParams represents two independently configured legs.

A future router would compose these surfaces. It must not weaken their authorization, exposure, strategy-binding, or token-receipt checks.

## Open design

A signed offer needs an explicit maker, allowed taker policy, token and adapter, amount bounds, arbiter, counterparty rules, maximum penalty, challenge and expiry terms, strategy bindings, metadata commitment, nonce, deadline, chain, manager, and router domain.

Partial fills require separate fill accounting and careful rounding. Agreement fills must define which party proposes, which accepts, and when each leg becomes funded. Cancellation must remain possible without scanning orders.

Fees should be explicit in the signed economic terms. A router-level transfer or hidden skim would bypass the manager distribution and accounting model.

## Security requirements

- signatures bind chain, manager, router, nonce, and full economic terms;
- no external call occurs before fill state is consumed;
- fee-on-transfer receipt amounts cannot create an underfunded commitment;
- a maker cannot be filled beyond signed capacity;
- strategy addresses and parameters cannot be substituted;
- all routes preserve the manager as the custody root;
- batch filling cannot turn one failed offer into partial hidden state.

## Delivery sequence

1. Specify typed data and cancellation semantics.
2. Add property tests for replay, partial fill, rounding, and malicious tokens.
3. Implement a minimal single-commitment fill.
4. Add bilateral agreement fills only after the single-leg surface is stable.
5. Integrate an indexer and UI without treating off-chain discovery as settlement truth.

This RFC is intentionally non-normative. Any implementation belongs in a later change with its own compatibility and audit review.
