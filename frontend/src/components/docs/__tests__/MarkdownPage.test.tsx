import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MarkdownPage } from '../MarkdownPage'
import { ThemeProvider } from '../../ui'

function renderPage(content: string, opts: { meta?: Record<string, unknown> } = {}) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <MarkdownPage
          content={content}
          sourcePath="protocol/reference/concepts/metadata.md"
          meta={opts.meta}
        />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('MarkdownPage', () => {
  it('renders headings, paragraphs, and inline code', () => {
    renderPage('# Vault\n\nA paragraph with `inline` code.\n')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Vault')
    expect(screen.getByText('inline').tagName.toLowerCase()).toBe('code')
  })

  it('renders tables (remark-gfm)', () => {
    renderPage('| h1 | h2 |\n|----|----|\n| a | b |\n')
    expect(screen.getByRole('table')).toBeTruthy()
  })

  it('rewrites internal .md links to /app/docs routes', () => {
    renderPage('[storage layout](../../architecture/storage-layout.md)')
    const link = screen.getByRole('link', { name: 'storage layout' }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/app/docs/protocol/architecture/storage-layout')
  })

  it('rewrites links outside docs to repository source URLs', () => {
    renderPage('[source ownership](../../../../src/README.md)')
    const link = screen.getByRole('link', { name: 'source ownership' }) as HTMLAnchorElement
    expect(link.href).toBe(
      'https://github.com/AInima-Collective/commitments/blob/main/src/README.md',
    )
    expect(link.target).toBe('_blank')
  })

  it('opens external links in a new tab', () => {
    renderPage('[ext](https://example.com)')
    const link = screen.getByRole('link', { name: 'ext' }) as HTMLAnchorElement
    expect(link.target).toBe('_blank')
  })

  it('shows the generated banner when meta.generated is true', () => {
    renderPage('# X\n', { meta: { generated: true, source: 'src/periphery/vaults/CommitmentsVault.sol' } })
    const banner = screen.getByRole('note')
    expect(banner.textContent).toMatch(/auto-generated/i)
    expect(banner.textContent).toContain('CommitmentsVault.sol')
  })

  it('renders mermaid blocks via the mermaid component (mounted, not as code)', () => {
    const { container } = renderPage('```mermaid\nsequenceDiagram\nA->>B: hi\n```\n')
    // MermaidBlock is a div, not a <pre><code>; it lazy-loads mermaid in an effect
    // and starts empty. Our test just verifies the wrapper landed.
    expect(container.querySelector('.ds-doc-mermaid')).not.toBeNull()
  })
})
