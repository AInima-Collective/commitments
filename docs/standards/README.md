---
status: current
---

# Standards family

The standards in this directory describe the public protocol surfaces implemented by this repository. Shipped Solidity is the source of truth; compiled artifacts and tests are the evidence for its behavior. When prose and contracts disagree, update the prose rather than inferring unshipped behavior.

All six specifications are drafts. “Draft” describes their publication status, not whether a reference implementation exists.

| Standard | Scope | Normative dependencies |
|---|---|---|
| [`ERC-COMMITMENTS`](./ERC-COMMITMENTS.md) | Core custody, backing valuation, commitment lifecycle, and manager-validated distributions | ERC-20 |
| [`ERC-COMMITMENTS-AGREEMENTS`](./ERC-COMMITMENTS-AGREEMENTS.md) | Bilateral commitment pairs and capped settlement | `ERC-COMMITMENTS` Parts A, C, and, for settlement, D |
| [`ERC-COMMITMENTS-MUTUALS`](./ERC-COMMITMENTS-MUTUALS.md) | Shared-loss mutual accounting, premiums, and heterogeneous valuation | `ERC-COMMITMENTS` Parts A and C |
| [`ERC-COMMITMENTS-MESH`](./ERC-COMMITMENTS-MESH.md) | Stake-topology discovery, fan-in/fan-out nodes, and token weighting | None; composes with Core and Services |
| [`ERC-COMMITMENTS-SERVICES`](./ERC-COMMITMENTS-SERVICES.md) | Operator registry, voting-power source, and stake-weighted signature validation | Core, EIP-712, ERC-1271, ERC-1822, and ERC-1967; a voting-power and eligibility source for service validation |
| [`ERC-COMMITMENTS-REWARDS`](./ERC-COMMITMENTS-REWARDS.md) | Standalone cumulative-merkle reward distribution | ERC-1822 and ERC-1967; no dependency on `ERC-COMMITMENTS` |

## Generated material

The selector appendix and public contract references are generated from compiled artifacts and must not be edited by hand. See [`generated/`](./generated/) for generated standards material.
