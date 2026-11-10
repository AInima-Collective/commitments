import { useMemo, useState } from 'react'
import { type Address } from 'viem'
import { type OperatorInfo, type OperatorStatus, type ServiceOperatorInfo } from '../../utils/mesh'
import { EmptyState, Notice, Skeleton } from '../ui'
import { OperatorRow } from './OperatorRow'
import { OperatorFilterBar } from './OperatorFilterBar'
import {
  filterOperators,
  deriveServiceTags,
  isFilterActive,
  type OperatorFilterInput,
  type OperatorFilterState,
  type OperatorMetadataLite,
} from '../../lib/operatorFilter'
import { useAgentIdentities } from '../../hooks/useAgentIdentities'
import { useMyDelegations } from '../../hooks/useMyDelegations'

interface OperatorWithStatus extends OperatorInfo {
  status: OperatorStatus
  /** Verified profile metadata, when the operator list came from the indexer. */
  metadata?: OperatorMetadataLite | null
}

interface OperatorListProps {
  operators: OperatorWithStatus[]
  isLoading: boolean
  serviceOperators?: ServiceOperatorInfo[]
}

/** Number of body cells in each operator-table row — kept in one place so the
 *  loading skeleton, expansion colSpan, and header all stay in lock-step. */
const COLUMN_COUNT = 5

function SkeletonOperatorRow() {
  return (
    <tr aria-hidden>
      <td>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <Skeleton shape="circle" width={20} height={20} />
          <Skeleton shape="text" width={140} />
        </div>
      </td>
      <td>
        <Skeleton animation="still" width={56} height={16} style={{ borderRadius: 999 }} />
      </td>
      <td style={{ textAlign: 'right' }}>
        <Skeleton shape="text" width={60} style={{ marginLeft: 'auto' }} />
      </td>
      <td style={{ textAlign: 'right' }}>
        <Skeleton shape="text" width={80} style={{ marginLeft: 'auto' }} />
      </td>
      <td style={{ textAlign: 'right' }}>
        <Skeleton shape="text" width={32} style={{ marginLeft: 'auto' }} />
      </td>
    </tr>
  )
}

export function OperatorList({ operators, isLoading, serviceOperators }: OperatorListProps) {
  const myDelegations = useMyDelegations()
  const [expandedAddress, setExpandedAddress] = useState<Address | null>(null)
  const [filterState, setFilterState] = useState<OperatorFilterState>({
    search: '',
    selectedTags: new Set(),
    serviceOnly: false,
  })

  const serviceMap = useMemo(() => {
    const m = new Map<string, ServiceOperatorInfo>()
    serviceOperators?.forEach((w) => m.set(w.address.toLowerCase(), w))
    return m
  }, [serviceOperators])

  // One ERC-8004 lookup for the whole table — rows receive resolved identities.
  const operatorAddresses = useMemo(() => operators.map((op) => op.address), [operators])
  const agents = useAgentIdentities(operatorAddresses)

  const filterInputs: OperatorFilterInput[] = useMemo(
    () =>
      operators.map((op) => ({
        operator: op,
        metadata: op.metadata ?? null,
        serviceInfo: serviceMap.get(op.address.toLowerCase()),
      })),
    [operators, serviceMap],
  )

  const availableTags = useMemo(
    () => deriveServiceTags(filterInputs),
    [filterInputs],
  )
  const filteredInputs = useMemo(
    () => filterOperators(filterInputs, filterState),
    [filterInputs, filterState],
  )

  const sortedInputs = useMemo(() => {
    const tier = (s: OperatorStatus): number =>
      s === 'ACTIVE' ? 0 : s === 'BELOW_MIN_STAKE' ? 1 : 2
    return [...filteredInputs].sort((a, b) => {
      const ta = tier((a.operator as OperatorWithStatus).status)
      const tb = tier((b.operator as OperatorWithStatus).status)
      if (ta !== tb) return ta - tb
      const sa = (a.operator as OperatorWithStatus).totalDelegatedStake
      const sb = (b.operator as OperatorWithStatus).totalDelegatedStake
      return sa < sb ? 1 : sa > sb ? -1 : 0
    })
  }, [filteredInputs])

  if (isLoading) {
    return (
      <div>
        <Notice tone="info" size="sm">SCANNING OPERATORS…</Notice>
        <div style={{ overflowX: 'auto', marginTop: 'var(--space-3)' }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th>Operator</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Self Stake</th>
                <th style={{ textAlign: 'right' }}>Total Delegated</th>
                <th style={{ textAlign: 'right' }}>Delegations</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((i) => <SkeletonOperatorRow key={i} />)}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (operators.length === 0) {
    return (
      <EmptyState
        title="NO OPERATORS REGISTERED"
        description="No operators have registered with this registry."
      />
    )
  }

  const filterIsActive = isFilterActive(filterState)
  const filteredEmpty = sortedInputs.length === 0

  return (
    <div>
      <OperatorFilterBar
        state={filterState}
        onChange={setFilterState}
        availableTags={availableTags}
        hasService={!!serviceOperators}
      />

      {filteredEmpty && filterIsActive ? (
        <EmptyState
          title="NO OPERATORS MATCH"
          description="Try a different search, clear a tag filter, or toggle off service-registered."
          action={
            <button
              type="button"
              className="ds-btn"
              onClick={() =>
                setFilterState({
                  search: '',
                  selectedTags: new Set(),
                  serviceOnly: false,
                })
              }
            >
              CLEAR FILTERS
            </button>
          }
        />
      ) : (
        <div style={{ overflowX: 'auto', marginTop: 'var(--space-3)' }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th>Operator</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Self Stake</th>
                <th style={{ textAlign: 'right' }}>Total Delegated</th>
                <th style={{ textAlign: 'right' }}>Delegations</th>
              </tr>
            </thead>
            <tbody>
              {sortedInputs.map((entry) => {
                const op = entry.operator as OperatorWithStatus
                return (
                  <OperatorRow
                    key={op.address}
                    operator={op}
                    agent={agents.get(op.address)}
                    serviceInfo={entry.serviceInfo}
                    expanded={expandedAddress === op.address}
                    onToggle={() =>
                      setExpandedAddress((prev) =>
                        prev === op.address ? null : (op.address as Address),
                      )
                    }
                    columnCount={COLUMN_COUNT}
                    hasDelegated={myDelegations.delegatedOperators.has(
                      op.address.toLowerCase(),
                    )}
                    myDelegations={myDelegations.byOperator.get(op.address.toLowerCase())}
                    onDelegationActed={myDelegations.refetch}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
