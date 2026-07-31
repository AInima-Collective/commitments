import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { SourceBlock } from '../SourceBlock'

const SAMPLE = `<TokenAmount amount={parseEther('12.4057')} decimals={18} symbol="ETH" />`

describe('SourceBlock', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    vi.useFakeTimers()
  })

  it('renders source text inside <pre><code> with data-language attribute when expanded', () => {
    render(<SourceBlock source={SAMPLE} language="tsx" defaultExpanded />)
    const code = screen.getByText(SAMPLE)
    expect(code.tagName).toBe('CODE')
    expect(code.getAttribute('data-language')).toBe('tsx')
    expect(code.parentElement?.tagName).toBe('PRE')
  })

  it('defaults to collapsed; toggle button has aria-expanded="false"', () => {
    render(<SourceBlock source={SAMPLE} />)
    const toggle = screen.getByRole('button', { name: /show source/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(SAMPLE)).toBeNull()
  })

  it('clicking the toggle button flips aria-expanded to "true" and reveals the code', () => {
    render(<SourceBlock source={SAMPLE} />)
    const toggle = screen.getByRole('button', { name: /show source/i })
    fireEvent.click(toggle)
    const after = screen.getByRole('button', { name: /hide source/i })
    expect(after.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(SAMPLE)).toBeTruthy()
  })

  it('defaultExpanded={true} starts expanded', () => {
    render(<SourceBlock source={SAMPLE} defaultExpanded />)
    const toggle = screen.getByRole('button', { name: /hide source/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(SAMPLE)).toBeTruthy()
  })

  it('clicking the copy button invokes navigator.clipboard.writeText with the source', async () => {
    render(<SourceBlock source={SAMPLE} defaultExpanded />)
    const copyBtn = screen.getByRole('button', { name: /copy source/i })
    await act(async () => {
      fireEvent.click(copyBtn)
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(SAMPLE)
  })

  it('shows COPIED feedback briefly after copy click', async () => {
    render(<SourceBlock source={SAMPLE} defaultExpanded />)
    const copyBtn = screen.getByRole('button', { name: /copy source/i })
    await act(async () => {
      fireEvent.click(copyBtn)
    })
    // After the click, the button label flips to indicate copied state
    expect(screen.getByRole('button', { name: /copied/i })).toBeTruthy()
    // After the timeout elapses it returns to "Copy source"
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByRole('button', { name: /copy source/i })).toBeTruthy()
  })

  it('renders an optional label above the block when provided', () => {
    render(<SourceBlock source={SAMPLE} label="USAGE" defaultExpanded />)
    expect(screen.getByText('USAGE')).toBeTruthy()
  })
})
