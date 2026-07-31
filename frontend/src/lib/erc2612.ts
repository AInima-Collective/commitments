import { type Address, type PublicClient, type TypedDataDomain } from 'viem'

/**
 * ERC-2612 (`permit`) support for the CommitmentManager's `depositWithPermit`
 * path — a gasless off-chain approval that collapses the usual approve + deposit
 * into a single transaction. Only tokens that implement ERC-2612 can use it
 * (raw permit-enabled ERC-20s like mainnet USDC); vault shares and plain
 * ERC-20s fall back to the two-tx approve → deposit flow.
 */

/** Minimal ABI for probing + signing an ERC-2612 permit. */
export const ERC2612_ABI = [
  {
    type: 'function',
    name: 'nonces',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'DOMAIN_SEPARATOR',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    // EIP-5267 — lets us read the exact signing domain (handles tokens whose
    // permit domain version isn't the OZ default of "1", e.g. USDC's "2").
    type: 'function',
    name: 'eip712Domain',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'fields', type: 'bytes1' },
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
      { name: 'salt', type: 'bytes32' },
      { name: 'extensions', type: 'uint256[]' },
    ],
  },
] as const

/** EIP-2612 `Permit` struct — field order is fixed by the standard. */
export const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export interface PermitMessage {
  owner: Address
  spender: Address
  value: bigint
  nonce: bigint
  deadline: bigint
}

export interface PermitTypedData {
  domain: TypedDataDomain
  types: typeof PERMIT_TYPES
  primaryType: 'Permit'
  message: PermitMessage
}

/**
 * Resolve the token's EIP-712 signing domain. Prefers EIP-5267
 * (`eip712Domain()`) so the version/name match the on-chain separator exactly;
 * falls back to `name()` + version `"1"` (the OpenZeppelin ERC20Permit default)
 * for tokens that predate EIP-5267.
 */
export async function resolvePermitDomain(
  client: PublicClient,
  token: Address,
  chainId: number,
): Promise<TypedDataDomain> {
  try {
    const [, name, version, , verifyingContract] = await client.readContract({
      abi: ERC2612_ABI,
      address: token,
      functionName: 'eip712Domain',
    })
    return { name, version, chainId, verifyingContract }
  } catch {
    const name = await client.readContract({
      abi: ERC2612_ABI,
      address: token,
      functionName: 'name',
    })
    return { name, version: '1', chainId, verifyingContract: token }
  }
}

/** Build viem-shaped typed data for an ERC-2612 permit. Pass to `signTypedData`. */
export function buildPermitTypedData(args: {
  domain: TypedDataDomain
  owner: Address
  spender: Address
  value: bigint
  nonce: bigint
  deadline: bigint
}): PermitTypedData {
  const { domain, owner, spender, value, nonce, deadline } = args
  return {
    domain,
    types: PERMIT_TYPES,
    primaryType: 'Permit',
    message: { owner, spender, value, nonce, deadline },
  }
}
