---
title: APY or NAV-floor cover
status: current
---

# APY or NAV-floor cover

A policyholder and underwriter can express a NAV-floor policy with shipped commitment primitives, but the repository does not ship a NavPerformanceArbiter or an on-chain APY oracle.

## Position

The underwriter deposits backing into CommitmentManager and creates a commitment with the policyholder or a restitution helper as counterparty. When backing is an ERC-4626 share token, ERC4626Adapter supplies the current conversion index for valuation-aware policy and strategy code.

The floor, observation window, data source, and penalty calculation belong in content-addressed policy metadata. The selected arbiter determines how an asserted breach is authorized.

## Shipped arbiter choices

- AttestationArbiter lets a configured service quorum sign InitiateForfeit after operators evaluate the policy off-chain.
- OptimisticInsuranceArbiter lets a claimant propose a penalty with a bond and lets disputers counter it until the answer timeout.

In both cases, CommitmentManager enforces the commitment maximum penalty and pause-adjusted forfeit execution delay. The manager does not independently verify NAV or APY, and its delay does not itself provide a generic contest method.

## Payout

After the forfeit proposal matures, executeForfeit credits the penalized backing to the counterparty free balance. The counterparty withdraws it from the manager. If the intended beneficiaries are all depositors in another vault with the same underlying asset, ForfeitDonationBeneficiary can redeem forfeited source-vault shares and donate the underlying to the target vault.

## Premium

Premium is not implied by the cover commitment. It may be handled out of band, by a separately bound distribution strategy such as IndexAppreciationYield, or by a Mutual premium policy. The repository does not ship an atomic linked-offer router for this pattern.

## References

- Attested arbiter: src/periphery/arbiters/AttestationArbiter.sol
- Optimistic arbiter: src/periphery/arbiters/OptimisticInsuranceArbiter.sol
- Vault-share adapter: src/backing/ERC4626Adapter.sol
- Restitution helper: src/periphery/vaults/ForfeitDonationBeneficiary.sol
- Tests: test/arbiters/AttestationArbiter.t.sol, test/arbiters/OptimisticInsuranceArbiter.t.sol, and test/vault/ForfeitDonationBeneficiary.t.sol
