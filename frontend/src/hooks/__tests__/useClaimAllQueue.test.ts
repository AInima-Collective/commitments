import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useTxQueue } from '../useClaimAllQueue'

const mocks = vi.hoisted(() => ({ write: vi.fn(), receipt: vi.fn() }))

vi.mock('wagmi', () => ({ useConfig: () => ({}) }))
vi.mock('wagmi/actions', () => ({ waitForTransactionReceipt: mocks.receipt }))
vi.mock('../useWriteAction', () => ({ useTx: () => ({ writeAsync: mocks.write }) }))
vi.mock('../../components/ui', () => ({ useToasts: () => ({ push: vi.fn() }) }))

describe('useTxQueue', () => {
  it('stops sending once the page that runs it unmounts', async () => {
    let mined: () => void = () => {}
    mocks.write.mockResolvedValue('0x01')
    mocks.receipt.mockReturnValue(new Promise<void>((resolve) => (mined = resolve)))
    const { result, unmount } = renderHook(() =>
      useTxQueue<bigint>({
        send: (_id, write) => write({} as never),
        commitmentIdOf: (id) => id,
        haltTitle: 'HALTED',
        haltBody: () => '',
      }),
    )
    act(() => result.current.run([1n, 2n, 3n]))
    await vi.waitFor(() => expect(mocks.receipt).toHaveBeenCalledTimes(1))

    unmount()
    mined()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.write).toHaveBeenCalledTimes(1)
  })
})
