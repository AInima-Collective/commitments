import { describe, expect, it, vi } from 'vitest'
import type { Address, PublicClient } from 'viem'

import { readArbiterIntrospection } from '../useArbiterProfile'

const ARBITER = '0x1000000000000000000000000000000000000001' as Address
const MANAGER = '0x2000000000000000000000000000000000000002' as Address

function client(input: {
  code?: `0x${string}` | undefined
  codeError?: Error
  reads?: Record<string, unknown | Error>
}) {
  const getCode = vi.fn(async () => {
    if (input.codeError) throw input.codeError
    return input.code
  })
  const readContract = vi.fn(async (request: { functionName: string }) => {
    const value = input.reads?.[request.functionName]
    if (value instanceof Error) throw value
    return value
  })
  return {
    value: { getCode, readContract } as unknown as PublicClient,
    getCode,
    readContract,
  }
}

describe('readArbiterIntrospection', () => {
  it('checks bytecode first and skips every selector for an EOA', async () => {
    const mock = client({ code: '0x' })
    const result = await readArbiterIntrospection(mock.value, ARBITER)
    expect(mock.getCode).toHaveBeenCalledTimes(1)
    expect(mock.readContract).not.toHaveBeenCalled()
    expect(result.interfaceSupport.status).toBe('not-applicable')
    expect(result.reportedManager.status).toBe('not-applicable')
    expect(result.capabilities.status).toBe('not-applicable')
    expect(result.metadataURI.status).toBe('not-applicable')
  })

  it('treats an ERC-165 rejection as a neutral legacy contract', async () => {
    const mock = client({ code: '0x6000', reads: { supportsInterface: false } })
    const result = await readArbiterIntrospection(mock.value, ARBITER)
    expect(mock.readContract).toHaveBeenCalledTimes(1)
    expect(result.interfaceSupport).toEqual({ status: 'unsupported', value: false })
    expect(result.reportedManager.status).toBe('not-declared')
  })

  it('reads all required selectors independently after IArbiter is claimed', async () => {
    const mock = client({
      code: '0x6000',
      reads: {
        supportsInterface: true,
        commitmentManager: MANAGER,
        arbiterCapabilities: 3n,
        arbiterMetadataURI: 'ipfs://policy',
      },
    })
    const result = await readArbiterIntrospection(mock.value, ARBITER)
    expect(mock.readContract.mock.calls.map(([request]) => request.functionName)).toEqual([
      'supportsInterface',
      'commitmentManager',
      'arbiterCapabilities',
      'arbiterMetadataURI',
    ])
    expect(result.reportedManager).toEqual({ status: 'success', value: MANAGER })
    expect(result.capabilities).toEqual({ status: 'success', value: 3n })
  })

  it('preserves useful fields when one required selector reverts', async () => {
    const mock = client({
      code: '0x6000',
      reads: {
        supportsInterface: true,
        commitmentManager: MANAGER,
        arbiterCapabilities: new Error('execution reverted'),
        arbiterMetadataURI: '',
      },
    })
    const result = await readArbiterIntrospection(mock.value, ARBITER)
    expect(result.reportedManager.status).toBe('success')
    expect(result.capabilities.status).toBe('failed')
    expect(result.metadataURI.status).toBe('success')
  })

  it('does not mistake an RPC failure for an EOA or legacy contract', async () => {
    const codeFailure = client({ codeError: new Error('RPC unavailable') })
    const codeResult = await readArbiterIntrospection(codeFailure.value, ARBITER)
    expect(codeResult.code.status).toBe('failed')
    expect(codeResult.interfaceSupport.status).toBe('unknown')
    expect(codeFailure.readContract).not.toHaveBeenCalled()

    const selectorFailure = client({
      code: '0x6000',
      reads: { supportsInterface: new Error('RPC timeout') },
    })
    const selectorResult = await readArbiterIntrospection(selectorFailure.value, ARBITER)
    expect(selectorResult.interfaceSupport.status).toBe('failed')
    expect(selectorResult.reportedManager.status).toBe('unknown')
  })
})
