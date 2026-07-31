---
title: "Service-Integrator Wiring Checklist"
status: current
---

# Service-Integrator Wiring Checklist

This guide is for integrators standing up a **service** (an AVS-style network)
secured by committed stake: operators register with backing, and their weighted
voting power gates the service's signature quorums. The wiring has one
**easy-to-miss step** — setting a per-denomination weight — without which every
operator has real stake but **zero voting power**, and the service silently can't
reach quorum. This checklist makes that step explicit.

## The chain: stake → voting power → quorum

```
operator self-stake + delegations   (OperatorRegistry)
            │  _meshOnIncrease  (on register / delegate)
            ▼
   per-operator FanIn node          (lazily cloned by MeshFactory)
            │
            ▼
      TokenWeighting sink           (weightBps per denom → voting power)
            │  getVotingPower
            ▼
  OperatorServiceRegistry           (sums signed power, checks quorum)
```

Committed stake becomes voting power only after `TokenWeighting` multiplies the
raw stake by a **governance-set weight** for that stake's denomination. The
registry credits stake automatically on `register`/`delegate` once mesh wiring is
in place — but the weight is a separate governance action.

## The silent gap

`TokenWeighting.updateWeight(denom, weightBps)` is `onlyGovernance` and **rejects
a zero weight**. Voting power is computed per denom as `rawStake × weightBps /
BPS`, and the sum **skips any denom whose weight is unset**:

```solidity
// src/extensions/mesh/TokenWeighting.sol — _computePower
uint256 w = weights[denom];
if (w > 0) {
    power += currentStake[staker][denom] * w / BPS;
}
// w == 0 → this denom contributes nothing; the operator's stake is invisible.
```

So an operator can be fully registered, with stake credited into the mesh, and
still return `getVotingPower(operator) == 0` until governance sets a nonzero
weight for the registry's `stakeDenom()`. In the service layer that surfaces as a
quorum that can never be met — no revert at wiring time, just a service that
can't act.

## Retiring a denomination

The voting-power queries are `O(denoms)`, so the registered-denom set is **bounded
by `MAX_DENOMS`** — registering a new denom past the cap reverts `DenomCapReached`.
Governance retires a denom with `retireDenom(denom)` (the bounded-set counterpart
to `updateWeight`, which can't set a zero weight):

- A denom that **never accrued stake** is purged from the iterated set outright and
  its slot reclaimed — it contributed zero at every block, so no historical query
  changes.
- A denom **with stake history** is instead made *inert*: a weight-0 epoch zeroes
  its contribution from that block onward and it rejects new stake, while every
  block **before** the retirement still resolves the weight in force then — so
  `getVotingPowerAt` / `getTotalPowerAt` at past blocks are unchanged. Re-activate it
  by calling `updateWeight` with a nonzero weight.

## Ordered checklist

### 1. Deploy the mesh factory and the TokenWeighting sink

The sink's **provider** must be the operator registry (the contract that credits
stake); its **governance** is whoever will set weights.

```solidity
MeshFactory meshFactory = new MeshFactory(fanInImpl, fanOutImpl, tokenWeightingImpl);

address tokenWeighting = meshFactory.deployTokenWeighting(
    address(operatorRegistry), // provider — the only contract allowed to credit stake
    governance                 // governance — the only address allowed to set weights
);
```

### 2. Wire the registry into the mesh

```solidity
operatorRegistry.setMeshWiring(tokenWeighting, address(meshFactory)); // DEFAULT_ADMIN_ROLE, one-time
```

Do this **before** operators register — wiring is not retroactive, so stake
credited before `setMeshWiring` would not reach the sink.

### 3. Set the denomination weight — the step everyone forgets

Read the registry's stake denomination and give it a nonzero weight. The weight
is full-precision `weightBps` (10000 = 1.0×); it can exceed 10000 to normalize
token decimals or encode a risk multiplier.

```solidity
bytes32 denom = operatorRegistry.stakeDenom();      // derived from requiredToken
TokenWeighting(tokenWeighting).updateWeight(denom, 10000); // governance; reverts if 0
```

**Skip this and every operator has 0 voting power.** This is the silent gap.

### 4. Register operators (stake now flows to the mesh automatically)

```solidity
// operator posts self-stake as a commitment with the registry as counterparty, then:
operatorRegistry.register(selfStakeCommitmentId);
// delegators add stake the same way:
operatorRegistry.delegate(operator, delegationCommitmentId);
```

Each call runs `_meshOnIncrease`, lazily cloning the operator's FanIn node and
crediting the `TokenWeighting` sink.

### 5. Deploy the service registry and enroll operators

`OperatorServiceRegistry` reads voting power from the `TokenWeighting` sink you
just wired.

```solidity
OperatorServiceRegistry service = OperatorServiceRegistry(
    address(new ERC1967Proxy(address(serviceImpl), abi.encodeCall(
        OperatorServiceRegistry.initialize,
        (
            address(operatorRegistry), // eligibility source (isOperator)
            tokenWeighting,            // voting-power source
            admin,
            thresholdWeight,           // minimum signed weight
            2,                         // quorum numerator
            3                          // quorum denominator (2/3)
        )
    )))
);

// operators enroll (gated on isOperator) and register a signing key:
vm.prank(operator);
service.enrollServiceOperator();
vm.prank(operator);
service.updateOperatorSigningKey(signingKey, proofOfPossession);
```

## Verify voting power is live

Before going live, assert the whole chain end-to-end:

```solidity
// weight is set for the registry's denom
require(TokenWeighting(tokenWeighting).getVotingPower(operator) > 0, "0 power - weight unset?");

// the service reads the same number
require(service.getVotingPower(operator) == TokenWeighting(tokenWeighting).getVotingPower(operator));

// raw stake is nonzero too (sanity: distinguishes "no stake" from "no weight")
require(operatorRegistry.getOperatorStake(operator) > 0, "operator has no stake");
```

If `getOperatorStake > 0` but `getVotingPower == 0`, the weight for
`stakeDenom()` is unset (or set on the wrong denom) — return to step 3.

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `getVotingPower == 0`, `getOperatorStake > 0` | Denom weight unset | `updateWeight(stakeDenom(), w)` |
| Power stays 0 after `updateWeight` | Weight set on the wrong denom | Use `operatorRegistry.stakeDenom()` exactly |
| Early operators have 0 power | `setMeshWiring` ran after they registered | Wire before registration |
| Service reads 0 but sink is nonzero | Wrong `votingPowerSource` at init | Point the service at the wired `TokenWeighting` |

## References

- Mesh primitives and topologies: the [Integrator guide](integrator.md),
  §"Composing mesh topologies".
- Contracts: `src/extensions/services/operator-registry/OperatorRegistry.sol` (`setMeshWiring`, `stakeDenom`),
  `src/extensions/mesh/TokenWeighting.sol` (`updateWeight`, `getVotingPower`),
  `src/extensions/services/service-registry/OperatorServiceRegistry.sol` (`initialize`, `enrollServiceOperator`).
