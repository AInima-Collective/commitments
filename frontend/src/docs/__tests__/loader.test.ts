import { describe, expect, it } from 'vitest'
import { LEGACY_ROUTE_ALIASES } from '../_order'
import { allEntries, docsTree, getEntryBySlug } from '../loader'

const EXPECTED_LEGACY_ROUTES: Record<string, string> = {
  'ERC-COMMITMENTS': 'standards/ERC-COMMITMENTS.md',
  erc: 'standards/ERC-COMMITMENTS.md',
  'erc-agreements': 'standards/ERC-COMMITMENTS-AGREEMENTS.md',
  'erc-mesh': 'standards/ERC-COMMITMENTS-MESH.md',
  'erc-mutuals': 'standards/ERC-COMMITMENTS-MUTUALS.md',
  'erc-rewards': 'standards/ERC-COMMITMENTS-REWARDS.md',
  'erc-selectors': 'standards/generated/selectors.md',
  'erc-services': 'standards/ERC-COMMITMENTS-SERVICES.md',
  'protocol/deployment/configuration': 'protocol/operations/configuration.md',
  'protocol/deployment/deployment-guide': 'protocol/operations/deployment.md',
  'protocol/erc-mutual-premium': 'standards/ERC-COMMITMENTS-MUTUALS.md',
  'protocol/marketplace-rfc': 'design/rfcs/marketplace.md',
  'protocol/reference/metadata-conventions': 'protocol/reference/concepts/metadata.md',
  'protocol/security/audit-checklist': 'protocol/security/review-checklist.md',
  'protocol/security/privacy': 'design/privacy.md',
  'protocol/units': 'protocol/reference/concepts/units.md',
}

describe('docs loader', () => {
  it('discovers the final current-documentation layout', () => {
    const paths = new Set(allEntries.map((e) => e.path))
    expect(paths.has('README.md')).toBe(true)
    expect(paths.has('standards/ERC-COMMITMENTS.md')).toBe(true)
    expect(paths.has('standards/generated/selectors.md')).toBe(true)
    expect(paths.has('protocol/README.md')).toBe(true)
    expect(paths.has('protocol/architecture/overview.md')).toBe(true)
    expect(paths.has('protocol/reference/concepts/metadata.md')).toBe(true)
    expect(paths.has('protocol/reference/contracts/periphery/vaults/CommitmentsVault.md')).toBe(true)
  })

  it('every current entry resolves back to itself by canonical slug', () => {
    for (const entry of allEntries) {
      const round = getEntryBySlug(entry.slug)
      expect(round, `slug ${JSON.stringify(entry.slug)} (path ${entry.path})`).toBeDefined()
      expect(round?.path).toBe(entry.path)
    }
  })

  it('preserves every frozen legacy route as an explicit lookup alias', () => {
    expect(LEGACY_ROUTE_ALIASES).toEqual(EXPECTED_LEGACY_ROUTES)
    for (const [slug, path] of Object.entries(EXPECTED_LEGACY_ROUTES)) {
      expect(getEntryBySlug(slug)?.path, slug).toBe(path)
    }
  })

  it('carries no archive pages', () => {
    expect(allEntries.some((entry) => entry.path.startsWith('archive/'))).toBe(false)
    expect(docsTree.children.some((node) => node.name === 'archive')).toBe(false)
    expect(getEntryBySlug('whitepaper')).toBeUndefined()
  })

  it('top-level tree shows only current sections in authority order', () => {
    expect(docsTree.children.map((node) => node.name)).toEqual([
      'standards',
      'protocol',
      'design',
    ])
  })

  it('orders standards core-first and protocol sections curricularly', () => {
    const standards = docsTree.children.find((node) => node.name === 'standards')
    expect(standards?.children.map((node) => node.name)).toEqual([
      'ERC-COMMITMENTS',
      'ERC-COMMITMENTS-AGREEMENTS',
      'ERC-COMMITMENTS-MUTUALS',
      'ERC-COMMITMENTS-MESH',
      'ERC-COMMITMENTS-SERVICES',
      'ERC-COMMITMENTS-REWARDS',
      'generated',
    ])

    const protocol = docsTree.children.find((node) => node.name === 'protocol')
    expect(protocol?.children.map((node) => node.name)).toEqual([
      'architecture',
      'guides',
      'reference',
      'operations',
      'security',
      'use-cases',
    ])
  })

  it('parses frontmatter on the core standard', () => {
    expect(getEntryBySlug('standards/ERC-COMMITMENTS')?.title).toBe('Core Commitments')
  })
})
