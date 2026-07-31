import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  it('renders title with role="status"', () => {
    render(<EmptyState title="NO COMMITMENTS" />)
    const root = screen.getByRole('status')
    expect(root).toBeTruthy()
    expect(screen.getByText(/NO COMMITMENTS/)).toBeTruthy()
  })

  it('renders both title and description text nodes when description provided', () => {
    render(
      <EmptyState
        title="NO COMMITMENTS"
        description="Stuff appears later."
      />,
    )
    expect(screen.getByText(/NO COMMITMENTS/)).toBeTruthy()
    expect(screen.getByText(/Stuff appears later\./)).toBeTruthy()
  })

  it('renders action slot when action provided', () => {
    render(
      <EmptyState
        title="X"
        action={<button data-testid="cta">Do</button>}
      />,
    )
    expect(screen.getByTestId('cta')).toBeTruthy()
  })

  it('emits .ds-empty-state class on root', () => {
    render(<EmptyState title="NO COMMITMENTS" />)
    const root = screen.getByRole('status')
    expect(root.className).toContain('ds-empty-state')
  })

  it('appends custom className to root', () => {
    render(<EmptyState title="X" className="extra" />)
    const root = screen.getByRole('status')
    expect(root.className).toContain('ds-empty-state')
    expect(root.className).toContain('extra')
  })
})
