// Landing-feature barrel. Page-shaped composition; not consumed elsewhere.
// Per the three-layer architecture (commitments/CLAUDE.md §Frontend):
// feature folders may import from `protocol/` and `ui/`, but `ui/` cannot
// import from here. These components carry landing-page context and are
// intentionally not part of the design-system surface on /design.
export { LandingShell } from './LandingShell'
export { Hero } from './Hero'
export { PrimitiveSection } from './PrimitiveSection'
export { ComposeSection } from './ComposeSection'
export { ApplicationsSection } from './ApplicationsSection'
export { ClosingSection } from './ClosingSection'
