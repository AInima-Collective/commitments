---
title: "Integrator Guide"
status: current
---

# Integrator Guide

This guide is for developers building on top of the Commitments Protocol —
custom arbiters, distribution strategies, backing adapters, vault yield
strategies, mesh topologies, or new commitment-based applications.

There are four distinct extension points, and it's worth keeping them straight:

| Extension point | Interface | Governs |
|-----------------|-----------|---------|
| Arbiter | (none — any address) | Who can release/forfeit a commitment |
| Distribution strategy | `IDistributionStrategy` | Value flows *within* a commitment |
| Backing adapter | `IBackingAdapter` | How a backing token is priced |
| Vault yield strategy | `IYieldStrategy` | Where a vault's idle assets earn |

## Building a custom arbiter

An arbiter is any contract (or EOA) that calls `releaseCommitment` or
`initiateForfeit` on the manager. To build a programmatic arbiter:

```solidity
contract MyArbiter {
    ICommitmentManager public immutable manager;

    constructor(address manager_) {
        manager = ICommitmentManager(manager_);
    }

    function resolve(uint256 commitmentId, bool inFavorOfCommitter, uint16 penaltyBps) external {
        // ...your resolution logic / authorization...
        if (inFavorOfCommitter) {
            manager.releaseCommitment(commitmentId);
        } else {
            manager.initiateForfeit(commitmentId, penaltyBps); // then executeForfeit after the pause-adjusted delay
        }
    }
}
```

Committers set `arbiter = address(myArbiter)`, giving the contract exclusive
release/forfeit authority. Remember the two-phase forfeit: `initiateForfeit`
starts the timer, and `executeForfeit` (permissionless) settles it after the
pause-adjusted forfeit execution delay. The stored `challengeWindow` does not
itself expose a generic challenge method; any dispute belongs to the arbiter's
decision process.

### Design considerations

- The arbiter is fixed at creation and can't be changed.
- One arbiter can manage many commitments.
- Make it upgradeable (behind a proxy) if the resolution logic must evolve.
- For service integration, the arbiter is typically the service manager or a
  contract operators trigger.

## Building a distribution strategy

A distribution strategy determines value flows *inside* a commitment — a yield
split, a fee, a premium. It implements `IDistributionStrategy` and returns
`TokenMovement[]` instructions that the manager validates and executes; the
strategy never moves tokens itself on the manager-mediated path.

```solidity
interface IDistributionStrategy {
    function onCommitmentCreated(CreatedContext calldata ctx) external;
    function onCommitmentReleased(LifecycleContext calldata ctx) external returns (TokenMovement[] memory);
    function onCommitmentForfeited(ForfeitContext calldata ctx) external returns (TokenMovement[] memory);
    function distribute(DistributeContext calldata ctx) external returns (TokenMovement[] memory);
    // claim / pending complete the surface — see the interface for the full set.
}
```

Key rules:

- `onCommitmentCreated` **may revert** to refuse an incompatible
  `(adapter, token)` — that's the compatibility gate, and its revert aborts
  creation. The lifecycle hooks (`onCommitmentReleased`, `onCommitmentForfeited`)
  run *guarded*: a revert parks the strategy's in-flight accrual in escrow rather
  than blocking the commitment.
- Movements are drawn from a **closed** vocabulary (`MovementKind`):
  `FromEncumberedToEscrow`, `FromEscrowToExternal`, `FromEscrowToFree`,
  `FromEncumberedToExternal`. The manager enforces the per-kind allow-list and
  the amount cap (INV-4) on every movement.
- Every contract that pays a recipient must emit `DistributionPaid` (§D.7),
  whether the payer is the manager or the strategy.

The shipped references — read the one closest to your flow before writing your own:

| Strategy | Value flow | Shape |
|----------|-----------|-------|
| `IndexAppreciationYield` | committer → counterparty, as backing appreciates | accrual via `FromEncumberedToEscrow` |
| `FlatFeeAtCreate` | committer → counterparty, fixed up-front fee | self-custody prefund |
| `CounterpartyPremiumStream` | **counterparty → committer**, streamed premium | self-custody, counterparty-funded |
| `OperatorCommissionCoupon` | committer → the delegation's operator (registry-resolved) | self-custody, allow-listed on the registry |

The last two are self-custody: they hold their own tokens and pay directly (still
emitting `DistributionPaid`), because the movement pipeline can only ever source
value from the committer's encumbrance or the strategy's own escrow — never from
the counterparty. That's the only way to express a counterparty-funded flow.

All four inherit `StrategyBase` (`src/distributions/StrategyBase.sol`). It holds
the immutable manager binding, the manager-only gate, a measured pull, and no-op
lifecycle hooks. A new strategy can inherit it and override only the hooks that
move value.

## Building a backing adapter

An adapter is a stateless, view-only pricer for a category of backing token. It
implements `IBackingAdapter`:

```solidity
interface IBackingAdapter {
    function indexNow(address token) external view returns (uint256);        // value-per-unit, 1e18-scaled
    function payoutDenomination(address token) external view returns (address); // informational
}
```

- `indexNow` returns the current value-per-unit index at **1e18 scale**. For raw
  ERC-20s with no internal appreciation it's the constant `1e18`; for ERC-4626
  shares it's `convertToAssets(1e18)`.
- **Scale contract.** The manager tracks commitments in *raw token units*
  (`Commitment.amount`); the index converts to priced value as
  `value = rawUnits × indexNow / 1e18`. Strategies that pay out appreciation read
  the *delta* between a stored `lastIndex` and `indexNow` — e.g.
  `IndexAppreciationYield` accrues
  `encumbered × (nowIndex − lastIndex) / 1e18`, applies the strategy's configured
  counterparty share, and converts back to units via `× 1e18 / nowIndex`.
  Because the index is a
  ratio, its absolute magnitude is irrelevant — only monotonic *growth* accrues
  yield; a flat `1e18` index accrues nothing, which is exactly why
  `ERC20StaticAdapter` is a valid backing.
- Adapters are **untrusted inputs, not authorities** — the manager only ever
  *reads* them, and the movement pipeline bounds what any adapter-derived number
  can move. Even so, an adapter feeding a manipulable spot price is a risk to
  strategies that price off it: prefer manipulation-resistant sources (a 4626
  `convertToAssets` rate, a TWAP) over a spot AMM read.
- Adapters must never custody tokens, mutate state, or hold a role.

`ERC20StaticAdapter` (flat 1e18) and `ERC4626Adapter` (share→asset rate) are the
shipped references.

## Building a vault yield strategy

A `CommitmentsVault`'s idle assets are deployed through a pluggable
`IYieldStrategy`. This is a *different* extension point from a distribution
strategy — it earns yield on vault assets, it does not touch commitments.

```solidity
interface IYieldStrategy {
    function deposit(uint256 assets) external;
    function withdraw(uint256 assets) external;
    function totalAssets() external view returns (uint256);
    function asset() external view returns (address);
    function maxDeposit() external view returns (uint256);
    function vault() external view returns (address); // must equal the binding vault
}
```

```solidity
contract AaveStrategy is IYieldStrategy {
    IERC20 public immutable asset_;
    IAavePool public immutable pool;
    address public immutable boundVault;

    function deposit(uint256 assets) external {
        require(msg.sender == boundVault);
        asset_.approve(address(pool), assets);
        pool.supply(address(asset_), assets, address(this), 0);
    }
    function withdraw(uint256 assets) external {
        require(msg.sender == boundVault);
        pool.withdraw(address(asset_), assets, boundVault);
    }
    function totalAssets() external view returns (uint256) { return aToken.balanceOf(address(this)); }
    function asset() external view returns (address) { return address(asset_); }
    function maxDeposit() external view returns (uint256) { return type(uint256).max; }
    function vault() external view returns (address) { return boundVault; }
}
```

Bind it (the vault checks `asset()` and `vault()` match):

```solidity
vault.setYieldStrategy(address(aaveStrategy)); // DEFAULT_ADMIN_ROLE
```

**Idle until set.** A vault whose `yieldStrategy` is `address(0)` is idle: it
holds assets directly and earns nothing (`totalAssets()` is its own balance),
and deposits/withdrawals never touch a strategy. On binding, the vault sweeps its
idle balance into the new strategy; a live→live migration must first drain the
old strategy (it refuses to switch while the outgoing strategy still reports
assets). Per deposit the vault `safeTransfer`s assets to the strategy then calls
`deposit`; per withdrawal it pulls any shortfall via `withdraw` before paying out
— so `deposit` is a receiver hook (tokens already delivered) and `withdraw` must
return assets to the vault.

`IYieldStrategy` (`src/periphery/vaults/interfaces/IYieldStrategy.sol`) states
the handshake each strategy must follow. `PremiumSkimStrategy` is the shipped
abstract base for strategies that skim a premium from yield.

## Composing mesh topologies

Use `MeshFactory` to deploy mesh nodes and wire them into custom topologies.

### Deploy nodes

```solidity
address fanIn = meshFactory.deployFanIn(consumerAddress, managerAddress);
address fanOut = meshFactory.deployFanOut(providerAddress, managerAddress);
address weighting = meshFactory.deployTokenWeighting(providerAddress, governanceAddress);
```

### Deterministic deployment

For topologies where contracts reference each other by address before deployment:

```solidity
bytes32 salt = keccak256("my-topology-v1-fanin");
address predicted = meshFactory.predictFanInAddress(salt);
// ...use `predicted` in other configs...
address actual = meshFactory.deployFanInAt(salt, consumer, manager);
assert(actual == predicted);
```

### Wire a pipeline

Example: two providers → FanIn → FanOut → two consumers, weighted for voting.

```solidity
// 1. Register providers on the FanIn (denomIn → denomOut, penalty, unbonding)
IFanIn(fanIn).registerProvider(providerA, keccak256("wstETH"), keccak256("wstETH-A"), 5000, 86400);
IFanIn(fanIn).registerProvider(providerB, keccak256("rETH"),   keccak256("rETH-B"),   5000, 86400);

// 2. Configure outflows on the FanOut (consumer, penalty bps, portion bps out of 10000)
Outflow[] memory outflows = new Outflow[](2);
outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 5000, portionBps: 6000}); // 60%
outflows[1] = Outflow({consumer: consumer2, maxPenaltyBps: 5000, portionBps: 4000}); // 40%
IFanOut(fanOut).setOutflows(keccak256("wstETH-A"), outflows);

// 3. Set governance weights on the TokenWeighting sink (weightBps, 10000 = 1.0x)
ITokenWeighting(weighting).updateWeight(keccak256("wstETH"), 10000);
ITokenWeighting(weighting).updateWeight(keccak256("rETH"),    8000);
```

## Consuming the operator registry

The registry's service-compatible views can be read by any framework:

```solidity
bool valid = operatorRegistry.isOperator(operatorAddr);
address[] memory operators = operatorRegistry.getOperatorSet();

IOperatorRegistry.Operator memory op = operatorRegistry.getOperator(operatorAddr);
uint256 stake = op.totalDelegatedStake;
if (stake < operatorRegistry.minOperatorStake()) {
    // handle a degraded operator...
}
```

Voting power is stake × the governance-assigned `TokenWeighting` weight — a
registered operator has zero weighted power until governance sets a weight for
its stake denomination.

## Using commitments for insurance

Insurance is a commitment whose arbiter is an oracle that forfeits to the
beneficiary when the insured event fires. The challenge window is a *feature*
here, not overhead — it can't be zero:

```solidity
uint256 commitmentId = manager.createCommitment(
    ICommitmentManager.CommitmentParams({
        arbiter: oracleArbiter,        // forfeits on the insured event
        counterparty: beneficiary,      // receives the payout
        token: token,
        adapter: adapterAddress,
        amount: 1000e18,
        maxPenaltyBps: 10000,          // 100% — full payout available
        challengeWindow: 86400,        // ≥ MIN_CHALLENGE_WINDOW; 0 would revert
        expiresAt: 0,
        strategies: new StrategyBinding[](0),
        metadataURI: "",
        metadataHash: bytes32(0)
    })
);
```

When the event occurs, the oracle initiates a full-penalty forfeit; after the
challenge window, anyone executes it and the beneficiary is credited the payout.
For a *premium* stream from the insured (counterparty) to the underwriter
(committer), bind `CounterpartyPremiumStream`: the insured funds it and it streams
premium to the committer for the life of the cover. For pooled, several-liability
coverage across many members, use the shared-loss mutual extension — see the
[Build a mutual](mutual.md) guide.

## Using agreements for bilateral service contracts

Two parties (e.g. two DAOs) bind an agreement under a shared arbiter. Each leg
carries its own `LegTerms` — token, adapter, amount, penalty ceiling, and
strategies — so the sides can differ completely, including a **cross-token
treaty** where each DAO stakes its own governance token:

```solidity
uint256 proposalId = manager.proposeAgreement(
    ICommitmentManager.AgreementParams({
        arbiter: disputeResolver,
        acceptor: daoB,
        proposerLeg: ICommitmentManager.LegTerms({
            token: daoAToken,              // DAO A backs with ITS token
            adapter: daoAAdapter,
            amount: 5000e18,
            maxPenaltyBps: 2500,           // 25% ceiling on A's side
            strategies: new StrategyBinding[](0)
        }),
        acceptorLeg: ICommitmentManager.LegTerms({
            token: daoBToken,              // DAO B backs with a DIFFERENT token
            adapter: daoBAdapter,
            amount: 3000e18,
            maxPenaltyBps: 1000,           // 10% ceiling on B's side
            strategies: new StrategyBinding[](0)
        }),
        challengeWindow: 604800,           // 7 days
        proposalDuration: 2592000,         // 30 days to accept
        metadataURI: "",
        metadataHash: bytes32(0),
        maxFlowProposerToAcceptor: 0,      // settlement cap in proposerLeg.token
        maxFlowAcceptorToProposer: 0       // settlement cap in acceptorLeg.token
    })
);

// acceptAgreement returns (agreementId, commitmentIdA, commitmentIdB)
(uint256 agreementId,,) = manager.acceptAgreement(proposalId); // DAO B accepts
manager.releaseAgreement(agreementId);       // both sides, if fulfilled
manager.forfeitAgreement(agreementId, 1000); // both legs forfeited at penaltyBps, if breached
```

Each leg is independent: different token, adapter, amount, penalty ceiling, and
strategy set. `forfeitAgreement(penaltyBps)` applies one `penaltyBps` to both
legs, validated against **each leg's own** `maxPenaltyBps` (so it must fit the
stricter of the two). `settleAgreement(agreementId, fromProposer, units, …)`
shifts up to a per-direction cap of the **payer leg's** token from the payer's
encumbered leg to the receiver's free balance — well-defined whether or not the
legs share a token. `acceptAgreement` returns the new agreement id alongside both
commitment ids.
