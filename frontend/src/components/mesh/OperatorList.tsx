import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useOperatorMetadata } from '../../hooks/useIndexerMetadata'
import { useAgentIdentities, type AgentIdentity } from '../../hooks/useAgentIdentities'
import { useMyDelegations } from '../../hooks/useMyDelegations'
import { type CommitmentWithStatus } from '../../utils/commitments'

interface OperatorWithStatus extends OperatorInfo {
  status: OperatorStatus
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
  const [metadataByAddress, setMetadataByAddress] = useState<
    Map<Address, OperatorMetadataLite | null>
  >(new Map())

  const handleMetadataReady = useCallback(
    (addr: Address, meta: OperatorMetadataLite | null) => {
      setMetadataByAddress((prev) => {
        const cur = prev.get(addr)
        if (
          cur === meta ||
          (cur &&
            meta &&
            cur.name === meta.name &&
            arraysShallowEqual(cur.services, meta.services))
        ) {
          return prev
        }
        const next = new Map(prev)
        next.set(addr, meta)
        return next
      })
    },
    [],
  )

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
        metadata: metadataByAddress.get(op.address as Address) ?? null,
        serviceInfo: serviceMap.get(op.address.toLowerCase()),
      })),
    [operators, metadataByAddress, serviceMap],
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
                  <OperatorRowItem
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
                    onMetadataReady={handleMetadataReady}
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

function OperatorRowItem({
  operator,
  agent,
  serviceInfo,
  expanded,
  onToggle,
  columnCount,
  onMetadataReady,
  hasDelegated,
  myDelegations,
  onDelegationActed,
}: {
  operator: OperatorWithStatus
  agent?: AgentIdentity
  serviceInfo?: ServiceOperatorInfo
  expanded: boolean
  onToggle: () => void
  columnCount: number
  onMetadataReady: (addr: Address, meta: OperatorMetadataLite | null) => void
  hasDelegated: boolean
  myDelegations?: CommitmentWithStatus[]
  onDelegationActed?: () => void
}) {
  const md = useOperatorMetadata(operator.address as Address)

  useEffect(() => {
    if (md.status === 'ok' && md.content && typeof md.content === 'object') {
      const c = md.content as Record<string, unknown>
      const lite: OperatorMetadataLite = {
        name: typeof c.name === 'string' ? c.name : undefined,
        services: Array.isArray(c.services)
          ? c.services.filter((s): s is string => typeof s === 'string')
          : undefined,
      }
      onMetadataReady(operator.address as Address, lite)
    } else if (md.status !== 'empty') {
      onMetadataReady(operator.address as Address, null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [md.status, md.content, operator.address])

  return (
    <OperatorRow
      operator={operator}
      agent={agent}
      expanded={expanded}
      onToggle={onToggle}
      serviceInfo={serviceInfo}
      columnCount={columnCount}
      hasDelegated={hasDelegated}
      myDelegations={myDelegations}
      onDelegationActed={onDelegationActed}
    />
  )
}

function arraysShallowEqual(
  a: string[] | undefined,
  b: string[] | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
