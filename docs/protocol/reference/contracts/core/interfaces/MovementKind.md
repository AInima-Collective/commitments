---
title: MovementKind
status: generated
source: src/core/interfaces/IDistributionStrategy.sol
generated: true
---
# MovementKind
The closed vocabulary of strategy-emitted value movements (ERC §D.2).

Manager-internal lifecycle moves (encumber, release, forfeit transfer, ...)
are NOT expressible as movements and are NOT available to strategies.


```solidity
enum MovementKind {
FromEncumberedToEscrow, // accrual: committer.encumbered -> strategy escrow
FromEscrowToExternal, // payout: strategy escrow -> recipient wallet (ERC-20 transfer out)
FromEscrowToFree, // payout: strategy escrow -> recipient's free balance (ledger credit)
FromEncumberedToExternal // direct payout: committer.encumbered -> recipient wallet
}
```
