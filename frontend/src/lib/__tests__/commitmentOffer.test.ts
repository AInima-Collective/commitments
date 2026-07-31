import { describe, expect, it } from 'vitest'
import {
  type Hex,
  concatHex,
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  toHex,
} from 'viem'

import {
  buildCommitmentOfferTypedData,
  strategiesHashOf,
  type CommitmentOfferParams,
} from '../commitmentOffer'

const MANAGER = '0x1111111111111111111111111111111111111111' as const
const COMMITTER = '0x2222222222222222222222222222222222222222' as const
const ARBITER = '0x3333333333333333333333333333333333333333' as const
const COUNTERPARTY = '0x4444444444444444444444444444444444444444' as const
const TOKEN = '0x5555555555555555555555555555555555555555' as const
const ADAPTER = '0x6666666666666666666666666666666666666666' as const
const STRATEGY = '0x7777777777777777777777777777777777777777' as const
const ZERO_HASH = `0x${'00'.repeat(32)}` as Hex
const CHAIN_ID = 31337

const PARAMS: CommitmentOfferParams = {
  arbiter: ARBITER,
  counterparty: COUNTERPARTY,
  token: TOKEN,
  adapter: ADAPTER,
  amount: 1_000_000n,
  maxPenaltyBps: 1000,
  challengeWindow: 86_400n,
  expiresAt: 0n,
  strategies: [{ strategy: STRATEGY, params: encodeAbiParameters([{ type: 'uint16' }], [2500]) }],
  metadataURI: 'ipfs://example',
  metadataHash: ZERO_HASH,
}

// Independent re-derivation of the manager's EIP-712 digest — mirrors
// CommitmentManager._buildStructHash + EIP712._hashTypedDataV4. If the
// typed-data field order in commitmentOffer.ts drifts from the contract
// typehash, this assertion breaks.
function contractDigest(nonce: bigint, deadline: bigint): Hex {
  const domainTypehash = keccak256(
    toHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
  )
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' },
      ],
      [
        domainTypehash,
        keccak256(toHex('Commitments')),
        keccak256(toHex('1')),
        BigInt(CHAIN_ID),
        MANAGER,
      ],
    ),
  )
  const createTypehash = keccak256(
    toHex(
      'CreateCommitment(address committer,address arbiter,address counterparty,address token,' +
        'address adapter,uint256 amount,uint16 maxPenaltyBps,uint64 challengeWindow,uint64 expiresAt,' +
        'bytes32 strategiesHash,string metadataURI,bytes32 metadataHash,uint256 nonce,uint256 deadline)',
    ),
  )
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'uint256' },
      ],
      [
        createTypehash,
        COMMITTER,
        ARBITER,
        COUNTERPARTY,
        TOKEN,
        ADAPTER,
        PARAMS.amount,
        BigInt(PARAMS.maxPenaltyBps),
        PARAMS.challengeWindow,
        PARAMS.expiresAt,
        strategiesHashOf(PARAMS.strategies),
        keccak256(toHex(PARAMS.metadataURI)),
        PARAMS.metadataHash,
        nonce,
        deadline,
      ],
    ),
  )
  return keccak256(concatHex(['0x1901', domainSeparator, structHash]))
}

describe('buildCommitmentOfferTypedData', () => {
  it('matches the contract EIP-712 digest field-for-field', () => {
    const nonce = 3n
    const deadline = 1_900_000_000n
    const typedData = buildCommitmentOfferTypedData({
      chainId: CHAIN_ID,
      verifyingContract: MANAGER,
      committer: COMMITTER,
      params: PARAMS,
      nonce,
      deadline,
    })
    expect(hashTypedData(typedData)).toBe(contractDigest(nonce, deadline))
  })

  it('changes the digest when the nonce changes (replay protection)', () => {
    const deadline = 1_900_000_000n
    const a = hashTypedData(
      buildCommitmentOfferTypedData({
        chainId: CHAIN_ID,
        verifyingContract: MANAGER,
        committer: COMMITTER,
        params: PARAMS,
        nonce: 1n,
        deadline,
      }),
    )
    const b = hashTypedData(
      buildCommitmentOfferTypedData({
        chainId: CHAIN_ID,
        verifyingContract: MANAGER,
        committer: COMMITTER,
        params: PARAMS,
        nonce: 2n,
        deadline,
      }),
    )
    expect(a).not.toBe(b)
  })
})

describe('strategiesHashOf', () => {
  it('is order-sensitive and empty-stable', () => {
    expect(strategiesHashOf([])).toBe(
      keccak256(
        encodeAbiParameters(
          [{ type: 'tuple[]', components: [{ name: 'strategy', type: 'address' }, { name: 'params', type: 'bytes' }] }],
          [[]],
        ),
      ),
    )
    const one = strategiesHashOf([{ strategy: STRATEGY, params: '0x' }])
    const oneB = strategiesHashOf([{ strategy: STRATEGY, params: '0x00' }])
    expect(one).not.toBe(oneB)
  })
})
