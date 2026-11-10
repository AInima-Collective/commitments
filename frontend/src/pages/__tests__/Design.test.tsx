import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ThemeProvider, ToastProvider } from '../../components/ui'
import { wagmiConfig } from '../../config/wagmi'
import Design from '../Design'

// The ordered section list of /app/design. The page is the spec for the UI
// vocabulary, so a section that disappears, moves, or loses its anchor is a
// regression this test exists to catch.
const SECTIONS: Array<[id: string, title: string]> = [
  ['color', 'Color'],
  ['typography', 'Typography'],
  ['brand', 'Brand'],
  ['social-link', 'Social Link'],
  ['spacing', 'Spacing'],
  ['stats', 'Stat Blocks'],
  ['assets', 'Assets'],
  ['defi-vaults', 'DeFi Vaults'],
  ['vault-metadata', 'Vault Metadata'],
  ['service-stake', 'Service Stake'],
  ['vault-header', 'Vault Header'],
  ['entity-cards', 'Entity Cards'],
  ['buttons', 'Buttons'],
  ['inputs', 'Inputs'],
  ['surfaces', 'Surfaces'],
  ['card', 'Card'],
  ['media-row', 'Media Row'],
  ['activity-feed', 'Activity Feed'],
  ['tables', 'Tables'],
  ['data-table', 'Data Table'],
  ['filter-bar', 'Filter Bar'],
  ['badges', 'Status Badges'],
  ['agent-badge', 'Agent Badge'],
  ['tx', 'Transaction State'],
  ['glyphs', 'Glyphs'],
  ['address', 'Address Display'],
  ['tabs', 'Tabs'],
  ['view-toggle', 'View Toggle'],
  ['navigation', 'Navigation'],
  ['page-header', 'Page Header'],
  ['entity-logo', 'Entity Logo'],
  ['operators', 'Operators'],
  ['commitments', 'Commitments'],
  ['mutual', 'Mutuals / Shared Loss'],
  ['commitment-naming', 'Commitment Naming'],
  ['metadata-editor', 'Metadata Editor'],
  ['loading', 'Loading & Placeholders'],
  ['motion', 'Motion'],
  ['notifications', 'Notifications & Errors'],
  ['empty', 'Empty States'],
  ['disclosure', 'Disclosure'],
  ['tooltip', 'Tooltip'],
  ['overlays', 'Overlays'],
  ['governance', 'Governance'],
  ['dev-tools', 'Dev Tools'],
]

beforeAll(() => {
  // The page has no data of its own; keep stray reads off the network.
  vi.stubGlobal('fetch', () => Promise.reject(new Error('no network in tests')))
  // SectionNav and the motion demos observe intersection; jsdom has none.
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    },
  )
})

function renderDesign() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <ThemeProvider>
      <ToastProvider>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter>
              <Design />
            </MemoryRouter>
          </QueryClientProvider>
        </WagmiProvider>
      </ToastProvider>
    </ThemeProvider>,
  )
}

// Each test renders all 45 sections; that takes a few seconds in jsdom and
// more on a loaded machine, so the default 5 s timeout is too tight.
describe('Design page', { timeout: 30_000 }, () => {
  it('renders every section, in order, with its anchor and heading', () => {
    const { container } = renderDesign()
    const headings = [...container.querySelectorAll('section > header[id]')].map((h) => [
      h.id,
      h.querySelector('h2')?.textContent,
    ])
    expect(headings).toEqual(SECTIONS)
  })

  it('links every section, in page order, from the table of contents', () => {
    const { container } = renderDesign()
    const toc = [...container.querySelectorAll('aside.ds-docs-toc a[href^="#"]')].map((a) =>
      a.getAttribute('href')!.slice(1),
    )
    expect(toc).toEqual(SECTIONS.map(([id]) => id))
  })
})
