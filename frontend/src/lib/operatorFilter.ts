import { type OperatorInfo, type ServiceOperatorInfo } from './mesh'

/**
 * Subset of `operator.v1` metadata needed for filter matching.
 *
 * Mirrors the wire shape produced by Phase 16's `useOperatorMetadata` hook
 * but narrowed to the two fields the filter pipeline reads. Keeping this
 * lite-typed avoids a hard dependency on the full metadata module so this
 * pure helper stays test-friendly under vitest's `node` environment.
 */
export interface OperatorMetadataLite {
  name?: string
  services?: string[]
}

/**
 * Per-operator filter input bundle.
 *
 * Callers compose this from `useOperators().operators[]`, the matching
 * `useOperatorMetadata()` result, and the matching `serviceInfo` slot from
 * the services-layer reader. The filter helper only reads what it needs.
 */
export interface OperatorFilterInput {
  operator: OperatorInfo
  metadata?: OperatorMetadataLite | null
  serviceInfo?: ServiceOperatorInfo
}

/**
 * Filter state owned by `<OperatorList>` (per CONTEXT.md "Filter state lives
 * in component state"). The filter is purely client-side; no network calls.
 *
 *   `search`        — raw user input; helper trims + lowercases internally
 *   `selectedTags`  — services tag set (OR-semantics within the set)
 *   `serviceOnly`      — when true, retain only operators registered in service
 */
export interface OperatorFilterState {
  search: string
  selectedTags: ReadonlySet<string>
  serviceOnly: boolean
}

/**
 * Apply the three Phase 21 filter dimensions in intersection (AND across
 * dimensions). Each dimension that is "default" (empty search / empty
 * tag set / serviceOnly === false) is a no-op for that dimension.
 *
 * Search semantics: case-insensitive substring match against the operator's
 * lowercase address AND its `metadata.name` (if present). Either match
 * suffices.
 *
 * Tag semantics: when `selectedTags` is non-empty, retain operator iff
 * `metadata.services` contains AT LEAST ONE selected tag (OR within the
 * selected set). Operators without `metadata.services` are EXCLUDED when
 * any tag is selected.
 *
 * Service semantics: when `serviceOnly === true`, retain only operators whose
 * `serviceInfo?.registeredInService === true`.
 */
export function filterOperators(
  inputs: ReadonlyArray<OperatorFilterInput>,
  state: OperatorFilterState,
): OperatorFilterInput[] {
  const needle = state.search.trim().toLowerCase()
  const hasSearch = needle !== ''
  const hasTags = state.selectedTags.size > 0

  return inputs.filter((entry) => {
    // Search dimension
    if (hasSearch) {
      const addrMatch = entry.operator.address.toLowerCase().includes(needle)
      const nameMatch =
        !!entry.metadata?.name &&
        entry.metadata.name.toLowerCase().includes(needle)
      if (!addrMatch && !nameMatch) return false
    }

    // Tag dimension (OR within selected set)
    if (hasTags) {
      const services = entry.metadata?.services
      if (!services || services.length === 0) return false
      let any = false
      for (const tag of services) {
        if (state.selectedTags.has(tag)) {
          any = true
          break
        }
      }
      if (!any) return false
    }

    // Service dimension
    if (state.serviceOnly) {
      if (!entry.serviceInfo?.registeredInService) return false
    }

    return true
  })
}

/**
 * Sorted, deduplicated union of all `metadata.services[]` arrays across the
 * input list. Drives the services-tag chip group in `<OperatorFilterBar>`.
 *
 * Returns `[]` when no operator has metadata (or none of the metadata
 * objects carry `services`).
 */
export function deriveServiceTags(
  inputs: ReadonlyArray<OperatorFilterInput>,
): string[] {
  const acc = new Set<string>()
  for (const entry of inputs) {
    const services = entry.metadata?.services
    if (!services) continue
    for (const tag of services) {
      acc.add(tag)
    }
  }
  // Lowercase comparison for stable ordering, matching `.operator-service-tag`
  // precedent (tags are rendered in their authored case but sorted by lower).
  return Array.from(acc).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  )
}

/**
 * Returns true iff at least one filter dimension is non-default.
 * Drives the `CLEAR FILTERS` button visibility in `<OperatorFilterBar>`.
 */
export function isFilterActive(state: OperatorFilterState): boolean {
  return (
    state.search.trim() !== '' ||
    state.selectedTags.size > 0 ||
    state.serviceOnly
  )
}
