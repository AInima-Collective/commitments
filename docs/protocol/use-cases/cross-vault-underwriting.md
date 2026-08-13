---
title: Cross-vault underwriting
status: current
---

# Cross-vault underwriting

An underwriter can back depositors in Vault A with shares of Vault B when both vaults use the same underlying asset.

## Shipped composition

1. The underwriter receives Vault B shares and deposits them into CommitmentManager.
2. The underwriter creates a commitment whose token is Vault B, adapter is ERC4626Adapter, and counterparty is ForfeitDonationBeneficiary.
3. The beneficiary is constructed with the manager, Vault B as sourceVault, and Vault A as targetVault.
4. If a forfeit executes, the manager credits Vault B shares to the beneficiary free balance.
5. Anyone calls beneficiary.sweep. It withdraws the shares from the manager, redeems them through Vault B, and donates the underlying to Vault A.

The donation raises Vault A assets without minting new Vault A shares. No vault has an encumbrance ledger or a manager binding.

## Trust and configuration

The two vaults must report the same underlying asset; the beneficiary constructor rejects a mismatch. The commitment arbiter and evidence policy determine when a loss can be initiated. The manager's forfeit execution delay and maximum penalty bound that authority; the delay does not itself create a generic challenge transaction.

The beneficiary is keyless and immutable. It sweeps all source-vault shares it holds, including direct transfers, into the target donation path.

## Premium

Premium is separate from the terminal forfeit path. It may be paid out of band, through a commitment-bound distribution strategy such as IndexAppreciationYield, or through the Mutual premium facilities when the underwriting is structured as a mutual. Do not combine premium mechanisms without an explicit economic design.

## References

- Beneficiary: src/periphery/vaults/ForfeitDonationBeneficiary.sol
- Vault: src/periphery/vaults/CommitmentsVault.sol
- Adapter: src/backing/ERC4626Adapter.sol
- Tests: test/vault/ForfeitDonationBeneficiary.t.sol and test/manager/integration/AgentVaultUnderwriting.t.sol
