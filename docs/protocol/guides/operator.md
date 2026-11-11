---
title: "Operator Guide"
status: current
---

# Operator Guide

This guide covers registering as an operator, accepting delegations, monitoring
your status, and deregistering.

## Prerequisites

- Free balance of the registry's **required backing token** in the
  CommitmentManager (see the acceptance policy below).
- Addresses for the CommitmentManager and OperatorRegistry.
- The minimum stake, from `operatorRegistry.minOperatorStake()`.

### The acceptance policy

The registry only accepts commitments that match its policy. Read it first:

```solidity
(address arbiter, uint16 minMaxPenaltyBps, address requiredToken)
    = operatorRegistry.getAcceptancePolicy();
```

Your self-stake commitment must use `token == requiredToken`,
`arbiter == arbiter`, `maxPenaltyBps >= minMaxPenaltyBps`, and set
`counterparty == address(operatorRegistry)`. Registration/delegation commitments
carry **no distribution strategies** — the registry rejects strategy bindings on
the stake path.

## 1. Register as an operator

Registration is a two-step process: create the stake commitment, then register it.

### Step 1 — create a self-stake commitment

```solidity
uint256 commitmentId = manager.createCommitment(
    ICommitmentManager.CommitmentParams({
        arbiter: policyArbiter,             // must equal the policy arbiter
        counterparty: address(operatorRegistry), // counterparty = registry
        token: requiredToken,               // must equal the policy token
        adapter: adapterAddress,
        amount: stakeAmount,                // must be ≥ minOperatorStake
        maxPenaltyBps: minMaxPenaltyBps,    // must be ≥ the policy floor
        challengeWindow: 86400,
        expiresAt: 0,
        strategies: new StrategyBinding[](0), // must be empty on the stake path
        metadataURI: "",
        metadataHash: bytes32(0)
    })
);
```

### Step 2 — register

```solidity
operatorRegistry.register(commitmentId);
```

The registry verifies on-chain that you are the commitment's committer, the
counterparty is this registry, the amount meets the minimum, the token/arbiter
match the policy, and the commitment is active. You are now an active operator;
your `totalDelegatedStake` starts at your self-stake amount.

### Gasless registration

A relayer can submit your signed registration intent (EOA or ERC-1271 contract
wallet). Sign the `Register(address operator,uint256 commitmentId,uint256 nonce,
uint256 deadline)` EIP-712 payload, then the relayer calls:

```solidity
operatorRegistry.registerWithSig(operator, commitmentId, deadline, nonce, signature);
```

The same acceptance checks apply — signature auth only changes *who submits*.
Revoke an unsent intent with `operatorRegistry.increaseNonce()`.

## 2. Accept delegations

Once registered, stakers can delegate to you with the same two-step pattern:

1. Staker creates a commitment with `counterparty = operatorRegistry`.
2. Staker calls `operatorRegistry.delegate(yourAddress, commitmentId)` (or the
   relayed `delegateWithSig(staker, operator, commitmentId, deadline, nonce, sig)`).

Each delegation increments your `totalDelegatedStake` and `activeDelegationCount`.

### Delegation limits

```solidity
uint256 maxDelegations = operatorRegistry.maxDelegationsPerOperator(); // default 1024
```

## 3. Monitor your status

```solidity
IOperatorRegistry.Operator memory op = operatorRegistry.getOperator(msg.sender);

op.totalDelegatedStake;    // self + delegated stake, in required-token units
op.activeDelegationCount;  // active delegations, including self-stake
op.active;                 // registration status
op.selfStakeActive;        // whether the self-stake commitment is still tracked
```

### Below minimum stake

If a delegation is forfeited or released and your `totalDelegatedStake` drops
below `minOperatorStake`, an `OperatorBelowMinStake` event fires. You remain
active. Consumers compare `totalDelegatedStake` with `minOperatorStake()`. To
recover, attract more delegations.

## 4. Service-compatible views

Service frameworks can query your operator set through standard views:

```solidity
operatorRegistry.getOperator(operatorAddress).totalDelegatedStake; // total stake
operatorRegistry.isOperator(operatorAddress);                      // active?
operatorRegistry.getOperatorSet();                                 // all active operators
operatorRegistry.getOperatorCount();                               // count
```

### Voting power requires a mesh weight

Stake alone is not voting power. Your stake becomes weighted voting power only
after governance assigns a weight to your stake denomination on the
`TokenWeighting` sink wired via `setMeshWiring`. Until then, a registered
operator has **zero** voting power. If you integrate with a service that reads
weighted power, confirm the weight has been set for `operatorRegistry.stakeDenom()`.

## 5. Forfeits and releases

When a delegation commitment is forfeited or released by its arbiter, the
CommitmentManager notifies the registry via callbacks in the same
transaction — no action is required from you:

- **Release:** `onDelegationReleased(commitmentId, amount)` — decrements your
  `totalDelegatedStake` and `activeDelegationCount`.
- **Forfeit:** `onDelegationForfeited(commitmentId, forfeitedAmount, fullAmount)`
  — closes the delegation. It removes the full amount credited at delegation
  from your `totalDelegatedStake`, not only the penalty.

The manager's hook call is gas-capped and a failure does not revert the close
(`RegistryHookFailed`). A failed hook leaves the delegation credited, which
blocks `deregister`. Anyone can call `operatorRegistry.reconcile(commitmentId)`
on a closed commitment to run the same close path.

## 6. Deregister

Deregistration requires that every delegation except your own self-stake has
been released or forfeited:

```solidity
operatorRegistry.deregister();
```

After deregistering you're removed from `getOperatorSet()` and your record is
marked `active = false`. Your self-stake commitment stays active and must be
released by its arbiter (or unbonded by you) separately.

### Re-registration

A deregistered operator can re-register by creating a new self-stake commitment
and calling `register()` with the new commitment id.
