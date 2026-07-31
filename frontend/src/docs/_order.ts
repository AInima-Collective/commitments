// Public documentation is grouped by authority: current standards and
// implementation guidance first, then design material.
export const TOP_LEVEL_ORDER = [
  '',
  'standards',
  'protocol',
  'design',
]

// Curricular ordering within the protocol documentation.
export const PROTOCOL_SECTION_ORDER = [
  'architecture',
  'guides',
  'reference',
  'operations',
  'security',
  'use-cases',
]

// The standard family is ordered core-first, then sibling extensions, followed
// by generated material.
export const STANDARDS_SECTION_ORDER = [
  'ERC-COMMITMENTS',
  'ERC-COMMITMENTS-AGREEMENTS',
  'ERC-COMMITMENTS-MUTUALS',
  'ERC-COMMITMENTS-MESH',
  'ERC-COMMITMENTS-SERVICES',
  'ERC-COMMITMENTS-REWARDS',
  'generated',
]

// Explicit compatibility aliases for the legacy routes that still resolve to a
// current page. These aliases affect lookup only: canonical entries retain
// their final slugs and the sidebar never advertises old URLs.
export const LEGACY_ROUTE_ALIASES: Record<string, string> = {
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

// Paths omitted from ordinary navigation and search.
export const EXCLUDED_PATHS: string[] = []

// Display titles for files where the auto-titleizer does not produce a useful
// navigation label.
export const FRIENDLY_TITLES: Record<string, string> = {
  'README.md': 'Overview',
  'standards/README.md': 'Standards',
  'standards/ERC-COMMITMENTS.md': 'Core Commitments',
  'standards/ERC-COMMITMENTS-AGREEMENTS.md': 'Agreements',
  'standards/ERC-COMMITMENTS-MESH.md': 'Mesh',
  'standards/ERC-COMMITMENTS-SERVICES.md': 'Services',
  'standards/ERC-COMMITMENTS-REWARDS.md': 'Rewards',
  'standards/ERC-COMMITMENTS-MUTUALS.md': 'Mutuals',
  'standards/generated/selectors.md': 'Selectors Appendix',
  'protocol/README.md': 'Protocol',
  'protocol/reference/README.md': 'Reference',
  'protocol/guides/README.md': 'Guides',
  'protocol/operations/README.md': 'Operations',
  'protocol/security/README.md': 'Security',
  'protocol/use-cases/README.md': 'Use Cases',
  'protocol/reference/contracts/_index.md': 'Generated Contracts',
  'design/README.md': 'Design',
}
