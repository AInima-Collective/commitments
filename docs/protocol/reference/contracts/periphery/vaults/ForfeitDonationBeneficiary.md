---
title: ForfeitDonationBeneficiary
status: generated
source: src/periphery/vaults/ForfeitDonationBeneficiary.sol
generated: true
---
# ForfeitDonationBeneficiary
**Inherits:**
ReentrancyGuardTransient

**Title:**
ForfeitDonationBeneficiary

Names a VAULT'S DEPOSITORS as a commitment's counterparty. Forfeit proceeds
(shares of `sourceVault`, paid into this contract's free balance on the
manager, pull-payment) are swept permissionlessly: withdrawn from the
manager, redeemed to the underlying, and donated into `targetVault` —
lifting NAV per share uniformly for every remaining depositor. No admin
keys, no owner, one one-way code path; trust is rooted in the immutable
(manager, sourceVault, targetVault) triple a committer opts into.
Canonical uses:
- Agent-managed vault (use-cases/agent-bonds.md): `source == target` — the
manager of vault V bonds shares OF V; slashing the manager redeems its
shares and donates the assets back into V, making V's depositors whole.
(Redeem-then-donate burns supply and returns the assets: NAV/share rises.)
- Cross-vault underwriting (use-cases/cross-vault-underwriting.md):
`source != target` — the underwriter's Vault-B shares are redeemed and
the proceeds donated to insured Vault A (both over the same asset).


## Constants
### manager
The commitment manager holding forfeited shares in this contract's
free balance.


```solidity
ICommitmentManager public immutable manager
```


### sourceVault
The vault whose shares this contract receives on forfeit.


```solidity
IERC4626 public immutable sourceVault
```


### targetVault
The vault the redeemed assets are donated into (may equal source).


```solidity
CommitmentsVault public immutable targetVault
```


## Functions
### constructor


```solidity
constructor(address manager_, address sourceVault_, address targetVault_) ;
```

### sweep

Permissionlessly convert every forfeited share this contract holds into
a donation to `targetVault`: manager free balance is withdrawn first,
then the full direct share balance (tolerating direct transfers) is
redeemed and the proceeds donated.


```solidity
function sweep() external nonReentrant returns (uint256 assets);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`assets`|`uint256`|The underlying amount donated.|


## Events
### ForfeitDonated
A sweep converted `shares` of `sourceVault` into `assets` donated to
`targetVault`.


```solidity
event ForfeitDonated(uint256 shares, uint256 assets);
```

## Errors
### AssetMismatch
The two vaults share one underlying asset; donation would revert or
misdenominate otherwise.


```solidity
error AssetMismatch(address sourceAsset, address targetAsset);
```

### NothingToSweep
Nothing to sweep: no source-vault shares on the manager ledger or in
direct balance.


```solidity
error NothingToSweep();
```

### ZeroAddress

```solidity
error ZeroAddress();
```
