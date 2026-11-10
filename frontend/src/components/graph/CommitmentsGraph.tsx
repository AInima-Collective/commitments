import '@react-sigma/core/lib/style.css'

import {
  ControlsContainer,
  FullScreenControl,
  SigmaContainer,
  ZoomControl,
  useLoadGraph,
  useRegisterEvents,
  useSetSettings,
  useSigma,
} from '@react-sigma/core'
import { useLayoutCircular } from '@react-sigma/layout-circular'
import { useWorkerLayoutForceAtlas2 } from '@react-sigma/layout-forceatlas2'
import { EdgeCurvedArrowProgram } from '@sigma/edge-curve'
import type { ForceAtlas2Settings } from 'graphology-layout-forceatlas2'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EdgeArrowProgram } from 'sigma/rendering'

import {
  buildAgreementsGraph,
  buildMeshGraph,
  buildMeshTopologyGraph,
  buildOperatorsGraph,
  type BuiltGraph,
  type BuiltGraphNodeAttrs,
} from '../../lib/graph/buildGraph'
import { applyPalette, getGraphPalette } from '../../lib/graph/palette'
import type {
  AgreementsGraphPayload,
  GraphNode,
  MeshGraphPayload,
  MeshTopologyNode,
  MeshTopologyPayload,
  OperatorsGraphNode,
  OperatorsGraphPayload,
} from '../../lib/graph/types'
import { Button, useTheme } from '../ui'

type Mode = 'agreements' | 'mesh' | 'mesh-topology' | 'operators'

type Props = {
  mode: Mode
  payload:
    | AgreementsGraphPayload
    | MeshGraphPayload
    | MeshTopologyPayload
    | OperatorsGraphPayload
    | undefined
  emptyMessage?: string
  isLoading?: boolean
  error?: unknown
  className?: string
  /**
   * If provided, the parent owns the right-side detail rendering: the built-in
   * `NodeDetailPanel` is suppressed and selection is forwarded as a lowercased
   * address (or `null` when the user clicks the empty stage). Lets a parent
   * render its own detail pane instead.
   */
  onNodeSelect?: (id: string | null) => void
  /** Overrides the internal selection so the parent can drive it externally. */
  selectedNodeId?: string | null
}

interface SelectedNode {
  id: string
  label: string
  data: GraphNode | OperatorsGraphNode | MeshTopologyNode
}

const FORCE_ATLAS2_SETTINGS: ForceAtlas2Settings = {
  gravity: 1,
  scalingRatio: 10,
  slowDown: 5,
}

const GRAPH_HEIGHT = 500

export function CommitmentsGraph({
  mode,
  payload,
  emptyMessage,
  isLoading,
  error,
  className,
  onNodeSelect,
  selectedNodeId,
}: Props) {
  const { theme } = useTheme()
  // Resolve palette per-render so SigmaContainer's mount-time settings (label
  // colors) reflect the current theme. Live theme switches after mount land
  // via the LayoutAndEvents `applyPalette` effect — see below.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `theme` is unread here; a theme change is what makes getGraphPalette's CSS variables differ
  const palette = useMemo(() => getGraphPalette(), [theme])

  const graph = useMemo<BuiltGraph | null>(() => {
    if (!payload) return null
    if (mode === 'agreements') {
      return buildAgreementsGraph(payload as AgreementsGraphPayload)
    }
    if (mode === 'mesh') {
      return buildMeshGraph(payload as MeshGraphPayload)
    }
    if (mode === 'mesh-topology') {
      return buildMeshTopologyGraph(payload as MeshTopologyPayload)
    }
    return buildOperatorsGraph(payload as OperatorsGraphPayload)
  }, [mode, payload])

  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)

  // Drop the selection whenever the graph itself changes (mode switch, new
  // payload). The id might no longer exist in the new graph and stale data
  // would just confuse the panel — the effect-resets-on-dep is the right
  // synchronization pattern even though the rule treats it suspiciously.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing selection with the external graph payload
    setSelectedNode(null)
  }, [graph])

  // Forward selection to the parent when controlled. The internal `selectedNode`
  // still feeds the visual reducer (size bump, neighbor highlight) regardless.
  const handleSelect = useCallback(
    (next: SelectedNode | null) => {
      setSelectedNode(next)
      onNodeSelect?.(next?.id ?? null)
    },
    [onNodeSelect],
  )

  // Allow the parent to drive selection (e.g. an "address paste" affordance).
  // We treat `selectedNodeId` as authoritative when present.
  const effectiveSelectedId = selectedNodeId ?? selectedNode?.id ?? null

  // Distinguish unreachable-indexer from indexer-returned-empty so users don't
  // mistake "indexer is down" for "I have no commitments."
  const showError = error && !graph

  if (!graph || graph.order === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          height: GRAPH_HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed var(--border)',
          color: showError ? 'var(--danger)' : 'var(--text-muted)',
          textAlign: 'center',
          padding: 16,
        }}
        className={className}
      >
        {showError ? (
          <>
            <div>Live data is temporarily unavailable.</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Please retry shortly.
            </div>
          </>
        ) : isLoading ? (
          'Loading graph…'
        ) : (
          emptyMessage ?? 'No data to display yet.'
        )}
      </div>
    )
  }

  return (
    <div
      className={`ds-graph-shell${className ? ` ${className}` : ''}`}
      style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}
    >
      <SigmaContainer
        style={{ height: GRAPH_HEIGHT, flex: '1 1 320px', minWidth: 0 }}
        graph={graph}
        settings={{
          defaultEdgeType: 'arrow',
          edgeProgramClasses: {
            arrow: EdgeArrowProgram,
            curved: EdgeCurvedArrowProgram,
          },
          renderEdgeLabels: true,
          edgeLabelSize: 10,
          edgeLabelColor: { color: palette.labels.edgeDefault },
          labelColor: { color: palette.labels.default },
          labelDensity: 0.07,
          labelSize: 11,
        }}
      >
        <LayoutAndEvents onSelect={handleSelect} selectedId={effectiveSelectedId} />
        <ControlsContainer position="top-right">
          <ZoomControl />
          <FullScreenControl />
        </ControlsContainer>
      </SigmaContainer>
      {!onNodeSelect && (
        <NodeDetailPanel
          selected={selectedNode}
          onClear={() => handleSelect(null)}
        />
      )}
    </div>
  )
}

/**
 * Runs ForceAtlas2 on mount with a short animation, then stops. Wires hover
 * highlighting (dims everything not connected) and click-to-select (raised
 * via `onSelect`, used by the side detail panel).
 */
function LayoutAndEvents({
  onSelect,
  selectedId,
}: {
  onSelect: (next: SelectedNode | null) => void
  selectedId: string | null
}) {
  const sigma = useSigma()
  const loadGraph = useLoadGraph()
  const setSettings = useSetSettings()
  const registerEvents = useRegisterEvents()
  const { positions, assign: assignCircular } = useLayoutCircular()
  const { start: startFA2, stop: stopFA2 } = useWorkerLayoutForceAtlas2({
    settings: FORCE_ATLAS2_SETTINGS,
  })
  const { theme } = useTheme()

  const [hovered, setHovered] = useState<string | null>(null)

  const extractNode = useCallback(
    (node: string): SelectedNode | null => {
      const graph = sigma.getGraph()
      if (!graph.hasNode(node)) return null
      const attrs = graph.getNodeAttributes(node) as BuiltGraphNodeAttrs
      return { id: node, label: attrs.label, data: attrs.data }
    },
    [sigma],
  )

  useEffect(() => {
    // Seed with circular positions, then run force layout for a short window.
    assignCircular()
    positions()
    // FA2's supervisor throws "layout was killed." synchronously from start()
    // if the supervisor was killed between callback identity changes — most
    // commonly under React.StrictMode's double-invoke or when the parent
    // SigmaContainer rewires the graph. This is benign cleanup signaling,
    // not a fatal error: the next render will create a fresh supervisor.
    let id: ReturnType<typeof setTimeout> | null = null
    try {
      startFA2()
      id = setTimeout(() => {
        try {
          stopFA2()
        } catch {
          /* supervisor already torn down */
        }
      }, 2000)
    } catch {
      /* supervisor was killed before start; next mount will retry */
    }
    return () => {
      if (id) clearTimeout(id)
      try {
        stopFA2()
      } catch {
        /* supervisor already torn down */
      }
    }
  }, [assignCircular, positions, startFA2, stopFA2, loadGraph])

  useEffect(() => {
    registerEvents({
      enterNode: ({ node }) => setHovered(node),
      leaveNode: () => setHovered(null),
      clickNode: ({ node }) => onSelect(extractNode(node)),
      clickStage: () => onSelect(null),
    })
  }, [registerEvents, onSelect, extractNode])

  // Live palette re-application — runs on mount and on every theme change.
  useEffect(() => {
    const graph = sigma.getGraph()
    const palette = getGraphPalette()
    applyPalette(graph as unknown as Parameters<typeof applyPalette>[0], palette)
    setSettings({
      labelColor: { color: palette.labels.default },
      edgeLabelColor: { color: palette.labels.edgeDefault },
    })
    sigma.refresh()
  }, [theme, sigma, setSettings])

  // Hover dim/highlight + selected-node accent reducer. Selected node gets
  // a thicker visual ring; non-selected, non-hovered nodes dim normally.
  useEffect(() => {
    const graph = sigma.getGraph()
    const palette = getGraphPalette()
    setSettings({
      nodeReducer: (node, data) => {
        const isSelected = selectedId === node
        const base = isSelected
          ? { ...data, size: (data.size as number) * 1.4, zIndex: 2 }
          : data
        if (!hovered) return base
        if (node === hovered || graph.neighbors(hovered).includes(node)) return base
        return { ...base, color: palette.dim, label: '' }
      },
      edgeReducer: (edge, data) => {
        const [source, target] = graph.extremities(edge)
        const touchesSelected = selectedId !== null && (source === selectedId || target === selectedId)
        const base = touchesSelected
          ? { ...data, size: (data.size as number) * 1.3 }
          : data
        if (!hovered) return base
        if (source === hovered || target === hovered) {
          return { ...base, size: (base.size as number) * 1.4 }
        }
        return { ...base, color: palette.dim, hidden: true }
      },
    })
  }, [hovered, selectedId, sigma, setSettings, theme])

  return null
}

function NodeDetailPanel({
  selected,
  onClear,
}: {
  selected: SelectedNode | null
  onClear: () => void
}) {
  return (
    <aside
      className="ds-card ds-graph-detail"
      aria-label="Selected node details"
      style={{
        flex: '0 1 280px',
        minWidth: 220,
        height: GRAPH_HEIGHT,
        overflowY: 'auto',
      }}
    >
      {selected === null ? (
        <div className="ds-stack ds-stack-2">
          <span className="ds-label">Selected node</span>
          <span className="ds-text-sm ds-subtle">
            Click a node in the graph to inspect its commitments and conviction.
          </span>
        </div>
      ) : (
        <div className="ds-stack ds-stack-3">
          <header className="ds-row ds-row-2" style={{ justifyContent: 'space-between' }}>
            <div className="ds-stack ds-stack-1">
              <span className="ds-label">Address</span>
              <code className="ds-text-sm">{selected.id}</code>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              aria-label="Clear selection"
              title="Clear selection"
            >
              ×
            </Button>
          </header>
          <dl className="ds-stack ds-stack-2" style={{ margin: 0 }}>
            <DetailRows data={selected.data} />
          </dl>
        </div>
      )}
    </aside>
  )
}

function DetailRows({ data }: { data: SelectedNode['data'] }) {
  // Operators-graph node: discriminated by `kind` ∈ 'service' | 'operator'.
  if ('kind' in data) {
    if (data.kind === 'service') {
      return (
        <>
          <DetailRow label="Role" value="operator service" />
          <DetailRow label="Total power" value={data.totalPower.toString()} />
          <DetailRow label="Operators" value={data.operatorCount.toString()} />
        </>
      )
    }
    return (
      <>
        <DetailRow label="Role" value="Operator" />
        <DetailRow label="Status" value={data.status} />
        <DetailRow
          label="Registered in service"
          value={data.registeredInService ? 'yes' : 'no'}
        />
        <DetailRow label="Voting power" value={data.votingPower.toString()} />
        <DetailRow
          label="Share"
          value={`${(data.shareBps / 100).toFixed(2)}%`}
        />
      </>
    )
  }
  // Mesh-topology node: discriminated by `type` ∈ 'service' | 'fan_in' | …
  // Note: Mesh Explorer suppresses this panel via `onNodeSelect`, so this
  // branch is mostly for future re-use.
  if ('type' in data) {
    return (
      <>
        <DetailRow label="Type" value={data.type} />
        {data.weights && data.weights.length > 0 && (
          <DetailRow
            label="Weights"
            value={data.weights
              .map((w) => `${(Number(w.weightBps) / 10_000).toFixed(2)}×`)
              .join(' / ')}
          />
        )}
      </>
    )
  }
  // Agreements / mesh-stake node — bare GraphNode shape.
  return (
    <>
      <DetailRow label="Commitments out" value={data.commitmentsOut.toString()} />
      <DetailRow label="Commitments in" value={data.commitmentsIn.toString()} />
      <DetailRow label="Active" value={data.activeCount.toString()} />
      <DetailRow label="Forfeited" value={data.forfeitedCount.toString()} />
      <DetailRow label="Released" value={data.releasedCount.toString()} />
      <DetailRow label="Conviction out" value={data.convictionOut.toString()} />
      <DetailRow label="Conviction in" value={data.convictionIn.toString()} />
    </>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="ds-row ds-row-3" style={{ justifyContent: 'space-between' }}>
      <dt className="ds-text-xs ds-subtle">{label}</dt>
      <dd className="ds-text-sm" style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </dd>
    </div>
  )
}
