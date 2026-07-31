import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Toast } from '../Toast'
import { ToastProvider } from '../ToastProvider'

describe('Toast role mapping', () => {
  it('renders role="alert" when tone="danger"', () => {
    render(<Toast tone="danger" title="Failed">Body</Toast>)
    const root = screen.getByRole('alert')
    expect(root.getAttribute('data-tone')).toBe('danger')
  })

  it('renders role="status" for non-danger tones (success)', () => {
    render(<Toast tone="success" title="Saved">Body</Toast>)
    // The live region inside ToastProvider also has role="status"-like — but
    // here we render Toast bare, so getByRole('status') finds the toast root.
    const root = screen.getByRole('status')
    expect(root.getAttribute('data-tone')).toBe('success')
  })

  it('uses the ds-toast root class', () => {
    render(<Toast tone="info" title="Hello">Body</Toast>)
    const root = screen.getByRole('status')
    expect(root.className).toContain('ds-toast')
  })
})

describe('ToastProvider live region', () => {
  it('mounts a single notifications region with the expected aria attributes', () => {
    render(
      <ToastProvider>
        <p>App content</p>
      </ToastProvider>,
    )
    const region = screen.getByRole('region', { name: /notifications/i })
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.getAttribute('aria-label')).toBe('Notifications')
    expect(region.className).toContain('ds-toast-region')
  })
})
