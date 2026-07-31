import {
  type Address,
  type Hex,
  type TypedDataDomain,
  encodeAbiParameters,
  keccak256,
} from 'viem'

/**
 * EIP-712 signing for the v2 `createCommitmentFor` flow — a committer signs a
 * commitment offer off-chain and any relayer (or the counterparty) submits it.
 *
 * The struct + field order mirror the manager's `CREATE_COMMITMENT_TYPEHASH`
 * exactly:
 *
 *   CreateCommitment(address committer,address arbiter,address counterparty,
 *     address token,address adapter,uint256 amount,uint16 maxPenaltyBps,
 *     uint64 challengeWindow,uint64 expiresAt,bytes32 strategiesHash,
 *     string metadataURI,bytes32 metadataHash,uint256 nonce,uint256 deadline)
 *
 * `strategiesHash` is pre-hashed (`keccak256(abi.encode(strategies))`) exactly
 * as the contract's `_buildStructHash` does, so the array is committed to
 * without enumerating its elements in the typed-data struct.
 *
 * Domain: name "Commitments", version "1" (the manager's `__EIP712_init`).
 */

const DOMAIN_NAME = 'Commitments'
const DOMAIN_VERSION = '1'

const STRATEGY_BINDING_TUPLE = {
  type: 'tuple[]',
  components: [
    { name: 'strategy', type: 'address' },
    { name: 'params', type: 'bytes' },
  ],
} as const

export const COMMITMENT_OFFER_TYPES = {
  CreateCommitment: [
    { name: 'committer', type: 'address' },
    { name: 'arbiter', type: 'address' },
    { name: 'counterparty', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'adapter', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'maxPenaltyBps', type: 'uint16' },
    { name: 'challengeWindow', type: 'uint64' },
    { name: 'expiresAt', type: 'uint64' },
    { name: 'strategiesHash', type: 'bytes32' },
    { name: 'metadataURI', type: 'string' },
    { name: 'metadataHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export interface StrategyBinding {
  strategy: Address
  params: Hex
}

/** The createCommitment param tuple, minus the signing metadata (committer,
 *  nonce, deadline) which the signer supplies. Mirrors the contract's
 *  CommitmentParams struct field order. */
export interface CommitmentOfferParams {
  arbiter: Address
  counterparty: Address
  token: Address
  adapter: Address
  amount: bigint
  maxPenaltyBps: number
  challengeWindow: bigint
  expiresAt: bigint
  strategies: StrategyBinding[]
  metadataURI: string
  metadataHash: Hex
}

/** `keccak256(abi.encode(strategies))` — the array commitment used by the
 *  typehash. Matches the contract's `keccak256(abi.encode(params.strategies))`. */
export function strategiesHashOf(strategies: StrategyBinding[]): Hex {
  return keccak256(encodeAbiParameters([STRATEGY_BINDING_TUPLE], [strategies]))
}

export interface CommitmentOfferMessage {
  committer: Address
  arbiter: Address
  counterparty: Address
  token: Address
  adapter: Address
  amount: bigint
  maxPenaltyBps: number
  challengeWindow: bigint
  expiresAt: bigint
  strategiesHash: Hex
  metadataURI: string
  metadataHash: Hex
  nonce: bigint
  deadline: bigint
}

export interface CommitmentOfferTypedData {
  domain: TypedDataDomain
  types: typeof COMMITMENT_OFFER_TYPES
  primaryType: 'CreateCommitment'
  message: CommitmentOfferMessage
}

/**
 * Build the viem-shaped typed data for a commitment offer. Pass the result
 * straight to `signTypedData`. The verifying contract is the manager; nonce
 * comes from `manager.nonces(committer)`.
 */
export function buildCommitmentOfferTypedData(args: {
  chainId: number
  verifyingContract: Address
  committer: Address
  params: CommitmentOfferParams
  nonce: bigint
  deadline: bigint
}): CommitmentOfferTypedData {
  const { chainId, verifyingContract, committer, params, nonce, deadline } = args
  return {
    domain: {
      name: DOMAIN_NAME,
      version: DOMAIN_VERSION,
      chainId,
      verifyingContract,
    },
    types: COMMITMENT_OFFER_TYPES,
    primaryType: 'CreateCommitment',
    message: {
      committer,
      arbiter: params.arbiter,
      counterparty: params.counterparty,
      token: params.token,
      adapter: params.adapter,
      amount: params.amount,
      maxPenaltyBps: params.maxPenaltyBps,
      challengeWindow: params.challengeWindow,
      expiresAt: params.expiresAt,
      strategiesHash: strategiesHashOf(params.strategies),
      metadataURI: params.metadataURI,
      metadataHash: params.metadataHash,
      nonce,
      deadline,
    },
  }
}

/** A fully-signed commitment offer, ready for `createCommitmentFor`. */
export interface SignedCommitmentOffer {
  committer: Address
  params: CommitmentOfferParams
  nonce: bigint
  deadline: bigint
  signature: Hex
}
