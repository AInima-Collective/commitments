import type { Hex } from 'viem'

import { AddressDisplay } from '../ui/AddressDisplay'
import { Notice } from '../ui/Notice'
import { SourceBlock } from '../ui/SourceBlock'
import type { ProposalKind } from './Status'

export interface ProposalActionRowProps {
  /** Action position within the proposal's targets[] array. */
  index: number
  /** Target contract called when the proposal executes. */
  target: Hex
  /** ETH value forwarded with the call (raw wei). */
  value: bigint
  /** Encoded calldata (4-byte selector + ABI args). */
  calldata: Hex
  /** Decoder kind (matches indexer's proposalAction.kind). */
  kind: ProposalKind | string
  /** Decoded action payload — shape depends on kind. */
  decoded: unknown
}

interface WeightUpdateDecoded {
  tokenWeighting?: Hex
  denom?: Hex
  newWeightBps?: string
}

interface ForfeitDecoded {
  manager?: Hex
  op?: 'initiateForfeit' | 'cancelForfeit'
  commitmentId?: string
  penaltyBps?: number
}

interface TreasuryDecoded {
  signature?: string
  args?: unknown[]
  rawCalldata?: Hex
}

/**
 * ProposalActionRow — per-kind dispatcher for governance proposal actions.
 *
 * Composes existing UI primitives only (AddressDisplay, Notice, SourceBlock).
 * Each kind renders a small block tuned to its semantics:
 *
 *   weight_update    → TokenWeighting + denom + new bps (current-vs-new
 *                      preview is added by the page).
 *   forfeit_arbitration → Commitment id + op + penalty (the page links the
 *                      commitmentId to /commitments/:id and overlays the
 *                      live arbiter check via useForfeitProposal).
 *   treasury         → Decoded signature + args if available, raw calldata
 *                      otherwise.
 *   signaling        → Suppress to a single muted line (the page promotes
 *                      the description block instead).
 */
export function ProposalActionRow({
  index,
  target,
  value,
  calldata,
  kind,
  decoded,
}: ProposalActionRowProps) {
  return (
    <article className="ds-proposal-action" data-kind={kind}>
      <header className="ds-row" style={{ alignItems: 'baseline', gap: 8 }}>
        <span className="ds-subtle">#{index}</span>
        <strong>{kindLabel(kind)}</strong>
        <span style={{ flex: 1 }} />
        <AddressDisplay address={target} compact />
      </header>

      <div className="ds-stack ds-stack-2" style={{ marginTop: 8 }}>
        {kind === 'weight_update' && <WeightUpdateBody decoded={decoded as WeightUpdateDecoded} />}
        {kind === 'forfeit_arbitration' && <ForfeitArbitrationBody decoded={decoded as ForfeitDecoded} />}
        {kind === 'treasury' && (
          <TreasuryBody decoded={decoded as TreasuryDecoded} value={value} calldata={calldata} />
        )}
        {kind === 'signaling' && (
          <Notice tone="info" size="sm">
            No on-chain side effect — this proposal is purely a signal. See description.
          </Notice>
        )}
      </div>
    </article>
  )
}

function kindLabel(kind: ProposalKind | string): string {
  switch (kind) {
    case 'weight_update':
      return 'Update mesh weight'
    case 'forfeit_arbitration':
      return 'Forfeit arbitration'
    case 'treasury':
      return 'Treasury / arbitrary call'
    case 'signaling':
      return 'Signaling (no-op)'
    case 'mixed':
      return 'Mixed actions'
    default:
      return kind
  }
}

function WeightUpdateBody({ decoded }: { decoded: WeightUpdateDecoded }) {
  return (
    <div className="ds-stack ds-stack-1">
      <div className="ds-row" style={{ gap: 8, alignItems: 'baseline' }}>
        <span className="ds-subtle">node</span>
        {decoded.tokenWeighting ? (
          <AddressDisplay address={decoded.tokenWeighting} compact />
        ) : (
          <span className="ds-subtle">—</span>
        )}
      </div>
      <div className="ds-row" style={{ gap: 8, alignItems: 'baseline' }}>
        <span className="ds-subtle">denom</span>
        <code className="ds-mono-num" title={decoded.denom ?? ''}>
          {decoded.denom ? `${decoded.denom.slice(0, 10)}…` : '—'}
        </code>
      </div>
      <div className="ds-row" style={{ gap: 8, alignItems: 'baseline' }}>
        <span className="ds-subtle">new weight</span>
        <strong className="ds-mono-num">
          {decoded.newWeightBps ? `${decoded.newWeightBps} bps` : '—'}
        </strong>
      </div>
    </div>
  )
}

function ForfeitArbitrationBody({ decoded }: { decoded: ForfeitDecoded }) {
  return (
    <div className="ds-stack ds-stack-1">
      <div className="ds-row" style={{ gap: 8, alignItems: 'baseline' }}>
        <span className="ds-subtle">op</span>
        <strong>{decoded.op ?? '—'}</strong>
      </div>
      <div className="ds-row" style={{ gap: 8, alignItems: 'baseline' }}>
        <span className="ds-subtle">commitment</span>
        {decoded.commitmentId ? (
          <a
            className="ds-link"
            href={`/app/commitments/${decoded.commitmentId}`}
            title={`Open commitment #${decoded.commitmentId}`}
          >
            #{decoded.commitmentId}
          </a>
        ) : (
          <span className="ds-subtle">—</span>
        )}
      </div>
      {decoded.op === 'initiateForfeit' && (
        <div className="ds-row" style={{ gap: 8, alignItems: 'baseline' }}>
          <span className="ds-subtle">penalty</span>
          <strong className="ds-mono-num">
            {decoded.penaltyBps != null ? `${decoded.penaltyBps} bps` : '—'}
          </strong>
        </div>
      )}
    </div>
  )
}

function TreasuryBody({
  decoded,
  value,
  calldata,
}: {
  decoded: TreasuryDecoded
  value: bigint
  calldata: Hex
}) {
  const showSignature = typeof decoded?.signature === 'string'
  return (
    <div className="ds-stack ds-stack-1">
      {value > 0n && (
        <div className="ds-row" style={{ gap: 8, alignItems: 'baseline' }}>
          <span className="ds-subtle">value</span>
          <code className="ds-mono-num">{value.toString()} wei</code>
        </div>
      )}
      {showSignature ? (
        <div className="ds-row" style={{ gap: 8, alignItems: 'baseline' }}>
          <span className="ds-subtle">signature</span>
          <code className="ds-mono-num">{decoded.signature}</code>
        </div>
      ) : null}
      <SourceBlock label="raw calldata" source={calldata} language="ts" />
    </div>
  )
}
