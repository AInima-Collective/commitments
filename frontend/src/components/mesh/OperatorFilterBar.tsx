import { Input, Select } from '../ui'
import { type OperatorFilterState, isFilterActive } from '../../lib/operatorFilter'

const ALL_SERVICES_VALUE = '__all__'

export interface OperatorFilterBarProps {
  state: OperatorFilterState
  onChange: (next: OperatorFilterState) => void
  /** Sorted, deduped service tags from `deriveServiceTags(inputs)`. */
  availableTags: string[]
  /** When false, the service-registered toggle is hidden entirely. */
  hasService: boolean
}

/**
 * Filter strip above the operator list. A search field (sized, not full-width),
 * a service Select, and a 2-segment service-only radio group. The compare feature
 * was removed in v3.0 — see Mesh.tsx history if it returns.
 */
export function OperatorFilterBar({
  state,
  onChange,
  availableTags,
  hasService,
}: OperatorFilterBarProps) {
  const filterActive = isFilterActive(state)

  // Single-select Service: the previous chip-row was visually noisy on small
  // viewports. Selecting a service replaces selectedTags with a 1-item set;
  // selecting "All" clears it. Multi-select can come back behind a popover
  // when we have evidence operators run >3 services on average.
  const currentService =
    state.selectedTags.size === 1
      ? Array.from(state.selectedTags)[0]
      : ALL_SERVICES_VALUE

  function clearFilters() {
    onChange({ search: '', selectedTags: new Set(), serviceOnly: false })
  }

  return (
    <div className="ds-operator-filter-bar">
      <Input
        type="search"
        placeholder="Search by address or name…"
        value={state.search}
        onChange={(e) => onChange({ ...state, search: e.target.value })}
        aria-label="Search operators by address or name"
      />

      <Select
        aria-label="Filter by service"
        value={currentService}
        onChange={(e) => {
          const v = e.target.value
          if (v === ALL_SERVICES_VALUE) {
            onChange({ ...state, selectedTags: new Set() })
          } else {
            onChange({ ...state, selectedTags: new Set([v]) })
          }
        }}
      >
        <option value={ALL_SERVICES_VALUE}>All services</option>
        {availableTags.map((tag) => (
          <option key={tag} value={tag}>
            {tag}
          </option>
        ))}
      </Select>

      {hasService && (
        <div
          role="radiogroup"
          aria-label="service registration filter"
          className="ds-row"
          style={{ gap: 0 }}
        >
          <button
            type="button"
            role="radio"
            aria-checked={!state.serviceOnly}
            aria-pressed={!state.serviceOnly}
            className="ds-btn ds-btn--sm"
            onClick={() => onChange({ ...state, serviceOnly: false })}
          >
            All
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={state.serviceOnly}
            aria-pressed={state.serviceOnly}
            className="ds-btn ds-btn--sm"
            onClick={() => onChange({ ...state, serviceOnly: true })}
          >
            Service only
          </button>
        </div>
      )}

      <span aria-hidden />

      {filterActive && (
        <button
          type="button"
          className="ds-btn ds-btn--sm ds-btn--ghost"
          onClick={clearFilters}
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
