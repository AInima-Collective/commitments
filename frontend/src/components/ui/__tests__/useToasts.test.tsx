import { describe, expect, it, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ToastProvider } from '../ToastProvider'
import { useToasts } from '../useToasts'

const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
)

afterEach(() => {
  vi.useRealTimers()
})

describe('useToasts', () => {
  it('throws a descriptive error when called outside <ToastProvider>', () => {
    // renderHook runs the hook synchronously; capturing the error is enough.
    // React 19 logs a console.error when a render throws — silence it locally.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useToasts())).toThrowError(
      /must be called inside <ToastProvider>/,
    )
    spy.mockRestore()
  })

  it('push then dismiss leaves the toasts array empty', () => {
    const { result } = renderHook(() => useToasts(), { wrapper })
    let id = ''
    act(() => {
      id = result.current.push({ tone: 'success', title: 'Saved' })
    })
    expect(result.current.toasts).toHaveLength(1)
    act(() => {
      result.current.dismiss(id)
    })
    expect(result.current.toasts).toHaveLength(0)
  })

  it('caps the visible stack at 3 with FIFO eviction', () => {
    const { result } = renderHook(() => useToasts(), { wrapper })
    const ids: string[] = []
    act(() => {
      ids.push(result.current.push({ tone: 'info', title: 'A' }))
      ids.push(result.current.push({ tone: 'info', title: 'B' }))
      ids.push(result.current.push({ tone: 'info', title: 'C' }))
      ids.push(result.current.push({ tone: 'info', title: 'D' }))
    })
    expect(result.current.toasts).toHaveLength(3)
    // Oldest (id=ids[0]) was evicted; newest (D) is present.
    const presentIds = result.current.toasts.map((t) => t.id)
    expect(presentIds).not.toContain(ids[0])
    expect(presentIds).toContain(ids[3])
  })

  it('auto-dismisses non-danger toasts after 5000ms', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useToasts(), { wrapper })
    act(() => {
      result.current.push({ tone: 'success', title: 'Saved' })
    })
    expect(result.current.toasts).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current.toasts).toHaveLength(0)
  })

  it('keeps tone="danger" toasts sticky beyond 10s', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useToasts(), { wrapper })
    act(() => {
      result.current.push({ tone: 'danger', title: 'Boom' })
    })
    expect(result.current.toasts).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(result.current.toasts).toHaveLength(1)
  })
})
