import { type Address, type Hex, getAddress, hexToString, isHex, keccak256, toBytes } from 'viem'
import { truncateAddress } from '../lib/format'

// ─── Status Types ─────────────────────────────────────────────────────────────

/**
 * All possible states for an operator in the registry.
 *
 *   ACTIVE           — operator is registered, active, and meets min stake
 *   INACTIVE         — operator is registered but deactivated
 *   BELOW_MIN_STAKE  — operator is active but total delegated stake < minStake
 */
export type OperatorStatus = 'ACTIVE' | 'INACTIVE' | 'BELOW_MIN_STAKE'

// ─── Operator Info ─────────────────────────────────────────────────────────────

/**
 * Typed representation of an on-chain Operator struct, enriched with address.
 */
export interface OperatorInfo {
  address: Address
  active: boolean
  selfStakeCommitmentId: bigint
  totalDelegatedStake: bigint
  activeDelegationCount: bigint
  registeredAt: bigint
  /**
   * Resolved self-stake amount (the `amount` of the commitment with id
   * `selfStakeCommitmentId`). Populated by the indexer-backed hook only —
   * the on-chain `useOperators` fallback leaves this `undefined` because
   * resolving it would require a per-row chain read.
   */
  selfStake?: bigint
}

// ─── Status Derivation ─────────────────────────────────────────────────────────

/**
 * Derive operator status from the operator struct fields.
 *
 * Precedence order:
 *  1. !op.active                                    → INACTIVE
 *  2. minStake && op.totalDelegatedStake < minStake → BELOW_MIN_STAKE
 *  3. Otherwise                                     → ACTIVE
 */
export function deriveOperatorStatus(
  op: { active: boolean; totalDelegatedStake: bigint },
  minStake?: bigint,
): OperatorStatus {
  if (!op.active) return 'INACTIVE'
  if (minStake !== undefined && op.totalDelegatedStake < minStake) return 'BELOW_MIN_STAKE'
  return 'ACTIVE'
}

// ─── Status Config ─────────────────────────────────────────────────────────────

/**
 * Maps operator status to CSS class name and aria-label for status badges.
 * Reuses existing status-* classes from styles/tokens.css where semantically appropriate.
 */
export const OPERATOR_STATUS_CONFIG: Record<
  OperatorStatus,
  { className: string; ariaLabel: string }
> = {
  ACTIVE:          { className: 'status-active',        ariaLabel: 'Status: Active' },
  INACTIVE:        { className: 'status-released',      ariaLabel: 'Status: Inactive' },
  BELOW_MIN_STAKE: { className: 'status-forfeit-pending', ariaLabel: 'Status: Below Min Stake' },
}

// ─── Service Operator Info ───────────────────────────────────────────────────────

/**
 * Services-layer state for an operator (from OperatorServiceRegistry).
 */
export interface ServiceOperatorInfo {
  address: Address
  registeredInService: boolean
  signingKey: Address | null
  votingPower: bigint
}

// ─── Node Type ─────────────────────────────────────────────────────────────────

/**
 * Raw node type strings as returned by IFlowQuery.nodeType().
 */
export type MeshNodeType = 'fan_in' | 'fan_out' | 'token_weighting'

/**
 * Human-readable label for a mesh node type.
 */
export function nodeTypeLabel(raw: string): string {
  switch (raw) {
    case 'fan_in':          return 'FAN IN'
    case 'fan_out':         return 'FAN OUT'
    case 'token_weighting': return 'TOKEN WEIGHTING'
    default:                return raw.toUpperCase()
  }
}

/**
 * CSS class for a mesh node type badge.
 * Classes are defined in styles/tokens.css.
 */
export function nodeTypeBadgeClass(raw: string): string {
  switch (raw) {
    case 'fan_in':          return 'node-type-fan-in'
    case 'fan_out':         return 'node-type-fan-out'
    case 'token_weighting': return 'node-type-weighting'
    default:                return 'node-type-unknown'
  }
}

// ─── Denom Decoder ─────────────────────────────────────────────────────────────

/**
 * Decode a bytes32 denom into a human-readable label.
 *
 * Solidity bytes32 carries two distinct denom shapes:
 *
 *   1. `bytes32("USDC")` — left-aligned ASCII with trailing zero padding.
 *      e.g. 0x5553444300000000…00 → "USDC"
 *   2. `keccak256("vaultShares")` — uniformly random 32 bytes that decode to
 *      garbage when interpreted as UTF-8.
 *
 * We sniff for shape #1 (printable-ASCII prefix followed by all zeros) and
 * decode it; otherwise fall back to a truncated hex form so the UI never
 * shows binary garbage.
 */
export function decodeDenom(denom: `0x${string}`): string {
  const hex = denom.startsWith('0x') ? denom.slice(2) : denom
  if (hex.length === 0 || /^0+$/.test(hex)) return '(unknown)'

  // Parse to bytes
  const bytes: number[] = []
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16))
  }

  // Shape #1 detection: leading printable ASCII chars, then a tail of nulls.
  const firstNull = bytes.indexOf(0)
  const prefix = firstNull === -1 ? bytes : bytes.slice(0, firstNull)
  const tail = firstNull === -1 ? [] : bytes.slice(firstNull)
  const printable = prefix.length > 0 && prefix.every((b) => b >= 0x20 && b <= 0x7e)
  const tailIsZero = tail.every((b) => b === 0)
  if (printable && tailIsZero) {
    return hexToString(denom).replace(/\0/g, '').trim() || '(unknown)'
  }

  // Shape #2: opaque hash. Show a short, mono-friendly hex chip.
  return truncateAddress(denom, 10, 6)
}

// ─── Denom Registry ────────────────────────────────────────────────────────────

/**
 * Off-chain knowledge about denoms used by the dev/seed environment. Mesh
 * contracts treat denoms as opaque `bytes32` so the protocol has no on-chain
 * registry; this map is the closest thing.
 *
 * Add new entries when you introduce a new well-known denom (e.g. when a
 * production deployment names another asset).
 */
export type DenomMetadataEntry = {
  /** Human-readable label, e.g. "Commitments Vault Shares · USDC". */
  label: string
  /** Underlying asset symbol if the denom is asset-bearing. */
  assetSymbol?: string
  /** Vault contract address that issues this denom (if vault-shares). */
  vaultAddress?: Address
  /** Free-text origin hint shown in the inspector ("derived from `keccak256(\"vaultShares\")`"). */
  sourceHint?: string
}

/**
 * Build the registry lazily so we only call `keccak256` once per page load.
 * Keys are lowercase 32-byte hex.
 */
function buildDenomMetadata(): Record<string, DenomMetadataEntry> {
  const fromKeccak = (s: string): Hex => keccak256(toBytes(s))
  const entries: Array<[Hex, DenomMetadataEntry]> = [
    [
      fromKeccak('usdcShares'),
      {
        label: 'Commitments Vault Shares',
        assetSymbol: 'USDC',
        sourceHint: 'keccak256("usdcShares") — USDC-denominated vault shares',
      },
    ],
    [
      fromKeccak('wethShares'),
      {
        label: 'Commitments Vault Shares',
        assetSymbol: 'WETH',
        sourceHint: 'keccak256("wethShares") — WETH-denominated vault shares',
      },
    ],
  ]
  const map: Record<string, DenomMetadataEntry> = {}
  for (const [key, value] of entries) map[key.toLowerCase()] = value
  return map
}

let _denomMetadata: Record<string, DenomMetadataEntry> | null = null
function denomMetadata(): Record<string, DenomMetadataEntry> {
  if (_denomMetadata === null) _denomMetadata = buildDenomMetadata()
  return _denomMetadata
}

/**
 * Detect denoms that are zero-padded ERC-20 addresses
 * (12 leading zero bytes + 20 address bytes).
 */
function denomAsAddress(denom: Hex): Address | null {
  if (!isHex(denom) || denom.length !== 66) return null
  // 32-byte hex: must start with 24 zero hex chars (12 bytes) for the
  // top half, leaving 40 chars (20 bytes) for the address.
  const head = denom.slice(2, 26)
  const tail = denom.slice(26)
  if (head !== '000000000000000000000000') return null
  try {
    return getAddress(`0x${tail}`)
  } catch {
    return null
  }
}

export type ResolvedDenom = {
  /** Display label rendered in the UI. */
  label: string
  /**
   * How the label was derived:
   *   - 'known'   — registry hit
   *   - 'address' — bytes32 was a zero-padded ERC-20 address
   *   - 'string'  — bytes32 was a Solidity string literal (`bytes32("USDC")`)
   *   - 'opaque'  — bare hash; label is a short hex chip
   *   - 'empty'   — all zeros
   */
  kind: 'known' | 'address' | 'string' | 'opaque' | 'empty'
  /** Optional asset symbol (e.g. "USDC", "wstETH") when known. */
  assetSymbol?: string
  /** Vault that issues these shares (when known). */
  vaultAddress?: Address
  /** Origin / provenance hint shown in the inspector. */
  sourceHint?: string
}

/**
 * Resolve a `bytes32` denom into UI-friendly metadata. Tries, in order:
 *   1. The hardcoded `denomMetadata()` registry of well-known denoms.
 *   2. Zero-padded ERC-20 address detection (denoms that are literal token addresses).
 *   3. The string-literal pattern (`bytes32("USDC")`).
 *   4. Short-hex fallback for opaque hashes — never returns binary garbage.
 *
 * Callers should prefer this over `decodeDenom` for any user-visible surface.
 */
export function resolveDenom(denom: Hex): ResolvedDenom {
  const lower = denom.toLowerCase()
  if (lower === '0x' || /^0x0+$/.test(lower)) {
    return { label: '(unknown)', kind: 'empty' }
  }
  const known = denomMetadata()[lower]
  if (known) {
    return {
      label: known.assetSymbol
        ? `${known.label} · ${known.assetSymbol}`
        : known.label,
      kind: 'known',
      assetSymbol: known.assetSymbol,
      vaultAddress: known.vaultAddress,
      sourceHint: known.sourceHint,
    }
  }
  const asAddress = denomAsAddress(denom)
  if (asAddress) {
    return {
      label: `${truncateAddress(asAddress)} (token address)`,
      kind: 'address',
    }
  }
  const decoded = decodeDenom(denom)
  // `decodeDenom` returns either a plain string label (string-literal shape)
  // or a short hex chip — we can detect the shape from the result.
  if (/^0x[0-9a-f]+…[0-9a-f]+$/i.test(decoded)) {
    return { label: `${decoded} (unknown denom)`, kind: 'opaque' }
  }
  return { label: decoded, kind: 'string' }
}
