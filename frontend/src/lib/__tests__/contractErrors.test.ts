import { describe, expect, it } from 'vitest'
import {
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  encodeErrorResult,
} from 'viem'
import { legibleWriteError } from '../contractErrors'

const ABI = [
  { type: 'error', inputs: [], name: 'CommitmentInMutual' },
  { type: 'error', inputs: [], name: 'SomethingObscure' },
  {
    type: 'function',
    inputs: [{ name: 'commitmentId', internalType: 'uint256', type: 'uint256' }],
    name: 'requestUnbond',
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

/** Wrap raw revert data the way wagmi surfaces it from a failed write. */
function revertError(errorName: 'CommitmentInMutual' | 'SomethingObscure') {
  const data = encodeErrorResult({ abi: ABI, errorName })
  const reverted = new ContractFunctionRevertedError({
    abi: ABI,
    functionName: 'requestUnbond',
    data,
  })
  return new ContractFunctionExecutionError(reverted, {
    abi: ABI,
    functionName: 'requestUnbond',
    args: [1n],
  })
}

describe('legibleWriteError', () => {
  it('maps a known custom error to friendly copy', () => {
    const msg = legibleWriteError(revertError('CommitmentInMutual'))
    expect(msg).toMatch(/mutual/i)
    expect(msg).not.toMatch(/0x/)
  })

  it('falls back to the decoded error name for unmapped errors', () => {
    expect(legibleWriteError(revertError('SomethingObscure'))).toBe(
      'Transaction reverted: SomethingObscure.',
    )
  })

  it('reports wallet rejection plainly', () => {
    const rejected = new UserRejectedRequestError(new Error('User rejected the request.'))
    expect(legibleWriteError(rejected)).toBe('Transaction rejected in your wallet.')
  })

  it('falls back to shortMessage for other viem errors', () => {
    const err = new BaseError('Something went wrong.')
    expect(legibleWriteError(err)).toBe('Something went wrong.')
  })

  it('handles plain Errors and unknowns', () => {
    expect(legibleWriteError(new Error('boom'))).toBe('boom')
    expect(legibleWriteError(undefined)).toBe('Unknown error.')
  })

  it('names a revert the wallet reported only by selector', () => {
    const raw = new BaseError('Execution reverted with reason: custom error 0x9f1ecc3a.')
    expect(legibleWriteError(raw)).toBe('A commitment needs a counterparty address.')
    expect(legibleWriteError(new BaseError('execution reverted: custom error 0x4209d367'))).toBe(
      'Transaction reverted: MutualExhausted.',
    )
  })
})
