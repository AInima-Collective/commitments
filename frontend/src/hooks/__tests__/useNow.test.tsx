import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useNowSeconds, useNowSelect } from '../useNow'

afterEach(() => {
  vi.useRealTimers()
})

describe('shared clock', () => {
  it('runs one interval for many subscribers and stops when the last leaves', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const setInterval = vi.spyOn(globalThis, 'setInterval')
    const clearInterval = vi.spyOn(globalThis, 'clearInterval')
    function Clock() {
      return <span>{useNowSeconds().toString()}</span>
    }
    const view = render(
      <>
        <Clock />
        <Clock />
        <Clock />
      </>,
    )
    expect(setInterval).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(view.getAllByText('1002')).toHaveLength(3)
    view.unmount()
    expect(clearInterval).toHaveBeenCalledTimes(1)
  })

  it('renders the current time on the first subscribe after the clock sat idle', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const first: string[] = []
    function Clock() {
      const now = useNowSeconds().toString()
      first.push(now)
      return <span>{now}</span>
    }
    render(<Clock />).unmount()
    vi.setSystemTime(1_010_000)
    first.length = 0
    render(<Clock />)
    expect(first[0]).toBe('1010')
  })

  it('re-renders a selector subscriber only when the selection changes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    let renders = 0
    function Deadline() {
      renders++
      const passed = useNowSelect((now) => now >= 1_005n)
      return <span>{passed ? 'passed' : 'waiting'}</span>
    }
    const view = render(<Deadline />)
    const initial = renders
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(renders).toBe(initial)
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(view.getByText('passed')).toBeTruthy()
    expect(renders).toBe(initial + 1)
  })
})
