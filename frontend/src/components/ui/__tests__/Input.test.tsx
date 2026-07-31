import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from '../Input'

describe('Input', () => {
  it('renders an <input> element with .ds-input class', () => {
    render(<Input value="" onChange={() => {}} />)
    const el = screen.getByRole('textbox') as HTMLInputElement
    expect(el.tagName).toBe('INPUT')
    expect(el.className).toContain('ds-input')
  })

  it('size="lg" sets data-size="lg" on the input element', () => {
    render(<Input size="lg" />)
    const el = screen.getByRole('textbox')
    expect(el.getAttribute('data-size')).toBe('lg')
  })

  it('tone="danger" sets aria-invalid="true" on the input element', () => {
    render(<Input tone="danger" />)
    const el = screen.getByRole('textbox')
    expect(el.getAttribute('aria-invalid')).toBe('true')
  })

  it('renders prefix slot inside .ds-input-group wrapper alongside the input', () => {
    render(<Input prefix={<span data-testid="pfx">$</span>} />)
    const pfx = screen.getByTestId('pfx')
    const group = pfx.closest('.ds-input-group')
    expect(group).not.toBeNull()
    const input = screen.getByRole('textbox')
    expect(input.closest('.ds-input-group')).toBe(group)
  })

  it('renders suffix slot inside .ds-input-group wrapper alongside the input', () => {
    render(<Input suffix={<span data-testid="sfx">USD</span>} />)
    const sfx = screen.getByTestId('sfx')
    const group = sfx.closest('.ds-input-group')
    expect(group).not.toBeNull()
    const input = screen.getByRole('textbox')
    expect(input.closest('.ds-input-group')).toBe(group)
  })

  it('uncontrolled: defaultValue renders without throwing and value is set', () => {
    render(<Input defaultValue="abc" />)
    const el = screen.getByRole('textbox') as HTMLInputElement
    expect(el.value).toBe('abc')
  })

  it('controlled: value="42" renders without throwing and value is set', () => {
    render(<Input value="42" onChange={() => {}} />)
    const el = screen.getByRole('textbox') as HTMLInputElement
    expect(el.value).toBe('42')
  })

  it('disabled prop adds disabled attribute on the input', () => {
    render(<Input disabled />)
    const el = screen.getByRole('textbox') as HTMLInputElement
    expect(el.disabled).toBe(true)
  })

  it('error prop renders an alert and links it via aria-describedby + aria-invalid', () => {
    render(<Input error="bad input" />)
    const input = screen.getByRole('textbox')
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('bad input')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toContain(alert.id)
    expect(alert.id).not.toBe('')
  })

  it('error prop appends to caller-supplied aria-describedby instead of replacing it', () => {
    render(<Input error="x" aria-describedby="caller-hint" />)
    const input = screen.getByRole('textbox')
    const described = input.getAttribute('aria-describedby') ?? ''
    expect(described).toContain('caller-hint')
    const alert = screen.getByRole('alert')
    expect(described).toContain(alert.id)
  })
})
