---
title: PremiumSkimStrategy
status: generated
source: src/periphery/vaults/strategies/PremiumSkimStrategy.sol
generated: true
---
# PremiumSkimStrategy
**Inherits:**
[IYieldStrategy](/docs/protocol/reference/contracts/periphery/vaults/interfaces/IYieldStrategy), ReentrancyGuardTransient

**Title:**
PremiumSkimStrategy

Abstract `IYieldStrategy` base that skims a configured share of NEW realized gains and
splits it between a fixed operator fee (the vault's manager) and a premium recipient
(a `VaultCoverConduit` funding the underwriters' premium stream). This is the funding
leg of the underwritten-vault pattern (use-cases/agent-bonds.md): the vault's own yield
pays the parties who keep its deposits covered.
Accounting model (high-water-mark discipline):
- `principal` tracks the vault's cost basis in the strategy: every vault `deposit`
raises it, every `withdraw` lowers it (donations enter through `deposit`, so donated
assets are principal and are never re-skimmed).
- Gains `G = max(totalAssets − principal, 0)`. Only gains ABOVE `chargedGains` (the
high-water mark of gains already charged) are skimmable — a drawdown pushes `G` under
the mark and no skim is possible until the venue fully recovers; `chargedGains` never
decreases on loss.
- `skim()` (permissionless) takes `skimBps` of the new gains, pays
`operatorFeeBps` of that fee to `operator` and the remainder to `premiumRecipient`,
then re-marks `chargedGains` at the post-skim gains level. Immediately after a skim
`G == chargedGains`, so NAV/share never drops below the previously charged mark —
a skim can never present as a drawdown breach of the peril floor.
- Withdrawals that exceed `principal` carry gains out to depositors; the exited gains
are removed from `chargedGains` (floored at zero) rather than treated as a loss.
Uncharged gains that exit this way simply escape the skim — the drift is bounded and
always in the depositors' favor.
Production pattern: inherit, route `_managedAssets()` at the live venue's valuation,
unwind liquidity in `_beforeWithdraw`, deploy it in `_afterDeposit`, and realize the
skim (make `fee` liquid in this contract) in `_realizeSkim`. The dev/demo concrete is
`test/helpers/SkimmingMockStrategy.sol`.
Custody model matches `CommitmentsVault._deposit`/`_withdraw` (push; vault-only moves)
— see `IdleStrategy` for the canonical handshake description. No admin, no upgrade:
the immutable parameter set is the whole trust surface.


## Constants
### asset
The underlying asset. MUST equal the vault's asset.


```solidity
address public immutable override asset
```


### vault
The vault address this strategy is bound to. The vault uses this to
validate that a strategy passed to `setYieldStrategy` was constructed for
this specific vault — guards against accidental cross-vault binding.


```solidity
address public immutable override vault
```


### operator
The vault manager (the agent): receives the fixed-fee leg of every skim.


```solidity
address public immutable operator
```


### premiumRecipient
Receives the premium leg of every skim (a `VaultCoverConduit` in the underwritten
vault pattern; any address works).


```solidity
address public immutable premiumRecipient
```


### skimBps
Share of NEW gains taken by a skim, in bps of the gains above the charged mark.


```solidity
uint16 public immutable skimBps
```


### operatorFeeBps
The operator's share OF the skim, in bps (the remainder funds the premium).


```solidity
uint16 public immutable operatorFeeBps
```


## State Variables
### principal
The vault's cost basis in this strategy: Σ deposits − Σ withdrawals (clamped ≥ 0).


```solidity
uint256 public principal
```


### chargedGains
High-water mark of gains already charged by past skims. Never decreases on loss.


```solidity
uint256 public chargedGains
```


## Functions
### constructor


```solidity
constructor(
    address asset_,
    address vault_,
    address operator_,
    address premiumRecipient_,
    uint16 skimBps_,
    uint16 operatorFeeBps_
) ;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`asset_`|`address`|The ERC-20 this strategy custodies; MUST equal the binding vault's `asset()`.|
|`vault_`|`address`|The `CommitmentsVault` proxy this strategy is bound to.|
|`operator_`|`address`|Receiver of the fixed operator fee.|
|`premiumRecipient_`|`address`|Receiver of the premium share.|
|`skimBps_`|`uint16`|Share of new gains skimmed (≤ 10_000).|
|`operatorFeeBps_`|`uint16`|Operator's share of the skim (≤ 10_000).|


### onlyVault


```solidity
modifier onlyVault() ;
```

### deposit

Take `assets` of the underlying into the strategy. PUSH pattern: the vault has
ALREADY transferred `assets` to this strategy before calling; implementations MUST
NOT `transferFrom` the vault. MUST be callable only by the bound `vault()`.

Raises the cost basis, then lets the concrete deploy the pushed assets. Donations
arrive through this same path (the vault pushes donated assets into the strategy),
so donated value is principal — never skimmed.


```solidity
function deposit(uint256 assets) external override onlyVault;
```

### withdraw

Return `assets` of the underlying to the vault. Implementations MUST transfer exactly
`assets` to `msg.sender` (the vault) before returning, or the vault's withdraw reverts.
MUST be callable only by the bound `vault()`.

Lowers the cost basis; a withdrawal beyond `principal` is gains physically leaving to
depositors — those exited gains are un-tracked from `chargedGains` (floored at zero),
NOT treated as a loss. The concrete unwinds liquidity in `_beforeWithdraw`; the base
then pays the vault.


```solidity
function withdraw(uint256 assets) external override onlyVault;
```

### totalAssets

Current value of everything this strategy holds for the vault, denominated in the
underlying. MUST include accrued/in-flight value and MUST reconcile with what
`withdraw` can pay, so the vault's share price cannot jump or become unbacked.


```solidity
function totalAssets() public view override returns (uint256);
```

### maxDeposit

Maximum additional assets the strategy can currently accept (`type(uint256).max` if
unbounded). The vault mirrors this into `maxDeposit`/`maxMint` so deposits/mints that
would exceed a strategy cap revert at the ERC-4626 boundary rather than deep inside.

Unbounded by default; concretes with a venue cap override.


```solidity
function maxDeposit() external view virtual override returns (uint256);
```

### pendingSkim

Preview what `skim()` would move right now.


```solidity
function pendingSkim() public view returns (uint256 newGains, uint256 operatorFee, uint256 premiumShare);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`newGains`|`uint256`|Gains above the charged high-water mark.|
|`operatorFee`|`uint256`|The operator's cut of the skim.|
|`premiumShare`|`uint256`|The premium recipient's cut of the skim.|


### skim

Permissionlessly charge the gains accrued above the high-water mark: pay the
operator fee and route the premium share, then re-mark. Reverts when there is
nothing to charge (no new gains, or the skim rounds to zero).


```solidity
function skim() external nonReentrant returns (uint256 operatorFee, uint256 premiumShare);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`operatorFee`|`uint256`|The amount paid to `operator`.|
|`premiumShare`|`uint256`|The amount routed to `premiumRecipient`.|


### _currentGains

Gains above cost basis, floored at zero (a drawdown reports 0, not negative).


```solidity
function _currentGains() internal view returns (uint256);
```

### _managedAssets

Current value of everything managed, denominated in the underlying. The concrete's
venue valuation; MUST reconcile with what `withdraw` can pay.


```solidity
function _managedAssets() internal view virtual returns (uint256);
```

### _afterDeposit

Deploy `assets` that the vault has already pushed into this contract.


```solidity
function _afterDeposit(uint256 assets) internal virtual;
```

### _beforeWithdraw

Unwind the venue so at least `assets` of the underlying sit liquid in this
contract, and drop them from the managed valuation.


```solidity
function _beforeWithdraw(uint256 assets) internal virtual;
```

### _realizeSkim

Make `fee` of the underlying liquid in this contract and drop it from the managed
valuation (it is about to be transferred out by the base).


```solidity
function _realizeSkim(uint256 fee) internal virtual;
```

## Events
### YieldSkimmed
New gains were charged: `fee` left the strategy out of `newGains` fresh gains.


```solidity
event YieldSkimmed(uint256 newGains, uint256 fee);
```

### OperatorFeePaid
The operator's fixed share of a skim was paid out.


```solidity
event OperatorFeePaid(address indexed operator, uint256 amount);
```

### PremiumRouted
The premium share of a skim was routed to the premium recipient.


```solidity
event PremiumRouted(address indexed premiumRecipient, uint256 amount);
```

## Errors
### OnlyVault
Reverts a fund-moving call from anyone other than the bound vault.


```solidity
error OnlyVault();
```

### NothingToSkim
`skim()` called with no new gains above the charged high-water mark.


```solidity
error NothingToSkim();
```

### BpsExceedsMax
A bps parameter exceeds 10_000.


```solidity
error BpsExceedsMax();
```

### ZeroAddress

```solidity
error ZeroAddress();
```
