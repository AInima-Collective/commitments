import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EncumbranceBar } from '../EncumbranceBar'

describe('EncumbranceBar', () => {
  it('renders meter with aria-valuenow reflecting encumbered/total ratio', () => {
    render(<EncumbranceBar encumbered={30n} total={100n} />)
    const meter = screen.getByRole('meter')
    expect(meter.getAttribute('aria-valuenow')).toBe('30')
    expect(meter.getAttribute('aria-valuemax')).toBe('100')
    expect(meter.getAttribute('aria-valuemin')).toBe('0')
    expect(meter.getAttribute('aria-label')).toBe('Encumbrance')
    // Label text contains percentages
    const root = meter.parentElement
    expect(root).not.toBeNull()
    expect(root!.textContent).toMatch(/FREE: 70\.0+%/)
    expect(root!.textContent).toMatch(/ENCUMBERED: 30\.0+%/)
  })

  it('renders empty state with NO POSITION label when total is 0n', () => {
    render(<EncumbranceBar encumbered={0n} total={0n} />)
    const meter = screen.getByRole('meter')
    expect(meter.getAttribute('aria-valuenow')).toBe('0')
    const root = meter.parentElement!
    expect(root.textContent).toContain('NO POSITION')
  })

  it('all-free position renders encumbered segment with width 0%', () => {
    const { container } = render(
      <EncumbranceBar encumbered={0n} total={100n} />,
    )
    const meter = screen.getByRole('meter')
    expect(meter.getAttribute('aria-valuenow')).toBe('0')
    const enc = container.querySelector('.ds-encumbrance-bar-encumbered') as HTMLElement | null
    expect(enc).not.toBeNull()
    expect(enc!.style.width).toBe('0%')
    const free = container.querySelector('.ds-encumbrance-bar-free') as HTMLElement | null
    expect(free).not.toBeNull()
    expect(free!.style.width).toBe('100%')
  })

  it('all-encumbered position renders aria-valuenow=100 and matching label', () => {
    render(<EncumbranceBar encumbered={100n} total={100n} />)
    const meter = screen.getByRole('meter')
    expect(meter.getAttribute('aria-valuenow')).toBe('100')
    const root = meter.parentElement!
    expect(root.textContent).toMatch(/ENCUMBERED: 100\.0+%/)
  })

  it('uses props.label as aria-label when supplied', () => {
    render(
      <EncumbranceBar
        encumbered={50n}
        total={100n}
        label="Position lock"
      />,
    )
    const meter = screen.getByRole('meter')
    expect(meter.getAttribute('aria-label')).toBe('Position lock')
  })

  it('size="sm" sets data-size="sm"; default applies data-size="md"', () => {
    const { container, rerender } = render(
      <EncumbranceBar encumbered={30n} total={100n} size="sm" />,
    )
    const root = container.querySelector('.ds-encumbrance-bar') as HTMLElement
    expect(root.getAttribute('data-size')).toBe('sm')

    rerender(<EncumbranceBar encumbered={30n} total={100n} />)
    const rootDefault = container.querySelector('.ds-encumbrance-bar') as HTMLElement
    expect(rootDefault.getAttribute('data-size')).toBe('md')
  })
})
