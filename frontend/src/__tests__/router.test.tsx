import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { page } from '../router'

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

const failedImport = () => Promise.reject(new Error('Failed to fetch dynamically imported module'))

describe('page', () => {
  it('reloads once on a failed import, then shows the error', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { pathname: '/app/explorer', reload })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const first = render(<Suspense fallback="loading">{page('Explorer', failedImport)}</Suspense>)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    first.unmount()

    // After the reload the same path fails again: no second reload.
    render(<Suspense fallback="loading">{page('Explorer', failedImport)}</Suspense>)
    expect(await screen.findByText('Could not load Explorer')).toBeTruthy()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('clears the mark when the path loads, so a later failure reloads again', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { pathname: '/app/explorer', reload })
    sessionStorage.setItem('reloaded:/app/explorer', '1')

    const loaded = render(
      <Suspense fallback="loading">{page('Explorer', async () => ({ default: () => <p>explorer</p> }))}</Suspense>,
    )
    expect(await screen.findByText('explorer')).toBeTruthy()
    expect(sessionStorage.getItem('reloaded:/app/explorer')).toBeNull()
    loaded.unmount()

    render(<Suspense fallback="loading">{page('Explorer', failedImport)}</Suspense>)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })
})
