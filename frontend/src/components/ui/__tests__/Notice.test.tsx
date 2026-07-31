import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Notice, type NoticeTone } from '../Notice'

describe('Notice', () => {
  it('renders with tone="info" size="sm" — root carries the ds-notice--info class and data-size="sm"', () => {
    render(
      <Notice tone="info" size="sm" title="Heads up">
        Body copy here.
      </Notice>,
    )
    const root = screen.getByRole('status')
    expect(root.classList.contains('ds-notice')).toBe(true)
    expect(root.classList.contains('ds-notice--info')).toBe(true)
    expect(root.getAttribute('data-size')).toBe('sm')
  })

  it('renders with tone="danger" — root has role="alert" and ds-notice--danger class', () => {
    render(
      <Notice tone="danger" title="Something broke">
        Details.
      </Notice>,
    )
    const root = screen.getByRole('alert')
    expect(root.classList.contains('ds-notice--danger')).toBe(true)
  })

  it('renders with as="section" — root tagName is SECTION', () => {
    render(
      <Notice as="section" tone="info" title="Sectioned notice">
        Hi.
      </Notice>,
    )
    const root = screen.getByRole('status')
    expect(root.tagName).toBe('SECTION')
  })

  it('renders icon, title, children, and actions slots when provided', () => {
    render(
      <Notice
        tone="info"
        icon={<span data-testid="notice-icon-slot">[i]</span>}
        title={<span data-testid="notice-title-slot">Title here</span>}
        actions={<button data-testid="notice-action-slot">Do it</button>}
      >
        <span data-testid="notice-body-slot">Body content</span>
      </Notice>,
    )
    expect(screen.getByTestId('notice-icon-slot')).toBeTruthy()
    expect(screen.getByTestId('notice-title-slot')).toBeTruthy()
    expect(screen.getByTestId('notice-body-slot')).toBeTruthy()
    expect(screen.getByTestId('notice-action-slot')).toBeTruthy()
  })

  it('renders a default glyph for non-neutral tones when icon is omitted', () => {
    const { container } = render(<Notice tone="success">Done.</Notice>)
    const icon = container.querySelector('.ds-notice-icon')
    expect(icon).toBeTruthy()
    expect(icon?.textContent).toBe('✓')
  })

  it('suppresses the icon entirely when icon={null}', () => {
    const { container } = render(
      <Notice tone="info" icon={null}>
        No icon
      </Notice>,
    )
    expect(container.querySelector('.ds-notice-icon')).toBeNull()
  })

  it('renders the dismiss button only when onDismiss is provided', () => {
    const { rerender, container } = render(<Notice tone="info">No dismiss</Notice>)
    expect(container.querySelector('.ds-notice-dismiss')).toBeNull()

    rerender(
      <Notice tone="info" onDismiss={() => {}}>
        With dismiss
      </Notice>,
    )
    expect(container.querySelector('.ds-notice-dismiss')).toBeTruthy()
  })

  it('adds the ds-toast class when isToast is set', () => {
    render(
      <Notice tone="info" isToast title="Toast">
        x
      </Notice>,
    )
    const root = screen.getByRole('status')
    expect(root.classList.contains('ds-toast')).toBe(true)
  })

  it('uses default tone="neutral" and default size="md" when omitted', () => {
    render(<Notice>Default body</Notice>)
    const root = screen.getByRole('status')
    expect(root.classList.contains('ds-notice--neutral')).toBe(true)
    expect(root.getAttribute('data-size')).toBe('md')
  })

  it.each<NoticeTone>(['neutral', 'info', 'success', 'warn', 'danger'])(
    'renders without throwing for tone=%s',
    (tone) => {
      expect(() => render(<Notice tone={tone}>tone={tone}</Notice>)).not.toThrow()
    },
  )
})
