# Backing — vault shares & adapters

Backing is whatever ERC-20 you encumber. The **canonical** backing is a
yield-bearing **ERC-4626 vault share**, so the stake keeps earning while it's
locked. The `adapter` you pass in `CommitmentParams` is read-only pricing
metadata that tells strategies how to value that token.

---

## Adapters — pricing the backing token

```solidity
interface IBackingAdapter {
  function indexNow(address token) external view returns (uint256);          // value-per-unit, 1e18 base
  function payoutDenomination(address token) external view returns (address); // informational: the token raw units are priced in
}
```

| Adapter | Use for | `indexNow` | Notes |
|---|---|---|---|
| `ERC20StaticAdapter` | plain ERC-20 (no internal appreciation) | constant `1e18` | stateless, one instance serves all ERC-20s |
| `ERC4626Adapter` | ERC-4626 vault shares / LSTs | `IERC4626(token).convertToAssets(1e18)` | stateless, reflects appreciation; serves all 4626 vaults |

Both are **stateless and shared** — one deployed instance each (see
`VITE_ERC20_ADAPTER_ADDRESS` / `VITE_ERC4626_ADAPTER_ADDRESS`). Pick the one that
matches your `token`: a vault share with `ERC20StaticAdapter` would report no
appreciation and break `IndexAppreciationYield` math.

Payouts always deliver **raw backing-token units** — the adapter never wraps or
unwraps on payout. `payoutDenomination` is purely informational.

---

## CommitmentsVault — the canonical backing source

A clean, single-asset, **permissionless** ERC-4626 (not a Morpho-style
curator-managed vault). Deposit the underlying, receive shares; the shares are
what you encumber in the manager.

```solidity
function deposit(uint256 assets, address receiver) returns (uint256 shares);
function mint(uint256 shares, address receiver) returns (uint256 assets);
function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares);
function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets);
function donate(uint256 assets) external;  // permissionless NAV uplift, no shares minted
// previews: previewDeposit/Mint/Withdraw/Redeem; convertToAssets/convertToShares
```

**Decimals:** `_decimalsOffset() = 9`, so vault shares have **9 fewer decimals**
than the underlying (an inflation-attack guard via virtual shares). E.g. 6-dp
USDC → 15-dp `cvUSDC` shares; 18-dp asset → 9-dp shares. When you compute an
`amount` to encumber, use **share** units and **share** decimals, not the
underlying's. Always `convertToShares` / read `balanceOf` rather than assuming
1:1.

### Get shares, then back a commitment

```ts
// underlying → shares → manager free balance (the backing `token` is the SHARE address)
await write(underlying, 'approve', [vault, assets])
await write(vault, 'deposit', [assets, me])           // → shares (note: shares != assets; price ≥ 1)
const shares = await read(vault, 'balanceOf', [me])
await write(vault, 'approve', [manager, shares])
await write(manager, 'deposit', [vaultAddress, shares])
// now create with token = vaultAddress, adapter = erc4626Adapter, amount in SHARE units.
```

### Vault yield strategy (admin)

The vault plugs an idle/yield `IStrategy` (`deposit/withdraw/totalAssets/
maxDeposit/asset/vault`). `setStrategy` (admin) requires the outgoing strategy to
hold 0 assets and the incoming one's `asset()`/`vault()` to match. The default
`IdleStrategy` just holds assets in the vault. Yield accrues into `totalAssets`,
lifting the share price — which is exactly what `ERC4626Adapter.indexNow` reads
and `IndexAppreciationYield` pays out on.

---

## VaultFactory — deploy a vault per asset

```solidity
function deployVault(address asset, address admin, address strategy) external returns (address vault); // onlyOwner
event VaultDeployed(address indexed asset, address indexed vault);
```

One vault per asset (`VaultAlreadyExists` on duplicate). Name/symbol derive from
the asset: `"Commitments <SYMBOL> Vault"` / `"cv<SYMBOL>"`. Deployed as an
ERC-1967 proxy over a shared implementation and initialized atomically. The
indexer discovers vaults via the `VaultDeployed` event.

---

## Plain ERC-20 backing (the simple path)

If you don't need yield, skip the vault: approve the manager for the ERC-20,
`deposit` it, and create with `adapter = ERC20StaticAdapter` and `amount` in that
token's own decimals. Everything else in `lifecycle.md` is identical.
