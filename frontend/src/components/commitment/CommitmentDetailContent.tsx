import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useChainId } from 'wagmi'
import { AddressDisplay, Disclosure } from '../ui'
import {
  AgentBadge,
  CommitmentTerms,
  Countdown,
  LifecycleStepper,
  MetadataProvenance,
  OperatorIdentity,
  PartyRow,
  RiskRow,
  commitmentLifecycle,
} from '../protocol'
import { findKnownAddress } from '../../config/contracts'
import { useAgentIdentities } from '../../hooks/useAgentIdentities'
import { type UnifiedCommitmentRowEntry } from '../../hooks/useUnifiedRows'
import { type CommitmentLabel } from '../../lib/commitmentLabel'
import { arbiterProfilePath } from '../../lib/arbitrationRoutes'
import {
  metadataAttestationId,
  metadataDescription,
  metadataTags,
  metadataTermsURI,
  metadataTrust,
  rendersSchema,
} from '../../lib/commitmentMetadata'

interface CommitmentDetailContentProps {
  row: UnifiedCommitmentRowEntry
  /** Backing-token decimals. Currently unused in the body but kept on the
   *  props so callers needn't change; the deferred yield-claim UI will use it. */
  decimals: number
  /** Total length of the unbonding period in seconds; only rendered when the
   *  row's status is UNBONDING. */
  unbondTotalSecs?: number
  unbondElapsed?: number
  /** Re-run the indexer's metadata fetch + verify. */
  onRefetchMetadata?: () => void
  /**
   * The row's resolved name. Passed in rather than derived here because the
   * page header renders it too, and two call sites deriving the same label
   * independently is how the §2 presentation rules drift apart.
   */
  label: CommitmentLabel
}

/**
 * Shared inner body for the commitment detail surface — used by both the
 * in-context drawer (CommitmentDetailDrawer) and the standalone detail page
 * (pages/CommitmentDetail). Read-only: parties, stake, yield breakdown,
 * metadata. Action affordances live in the parent (Resolve modal trigger).
 *
 * Uses design-system primitives end-to-end: `ds-party-list` + `PartyRow` for
 * the role table, `RiskRow` for max penalty, `MetadataSummary` for the
 * metadata badge, `Countdown` for both the forfeit and unbond windows.
 */
export function CommitmentDetailContent({
  row,
  unbondTotalSecs,
  unbondElapsed,
  onRefetchMetadata,
  label,
}: CommitmentDetailContentProps) {
  const c = row.commitment
  const lifecycle = commitmentLifecycle(c.status)
  const chainId = useChainId()
  const { address: connectedAddress } = useAccount()
  // Known protocol contracts (e.g. the agent-bond restitution beneficiary)
  // render as a human label instead of a bare address — the address stays
  // reachable via the adjacent AddressDisplay (title + copy affordance).
  const knownCounterparty = findKnownAddress(chainId, row.counterparty)
  const lower = connectedAddress?.toLowerCase()
  const youOnCommitter = lower === row.committer.toLowerCase()
  const youOnCounterparty = lower === row.counterparty.toLowerCase()
  const youOnArbiter = lower === row.arbiter.toLowerCase()

  // Metadata comes off the row. `GET /commitments/:id` selects the whole row,
  // so the content was already on the response that rendered this page — the
  // second GraphQL round trip this used to make was paying twice for bytes we
  // already had.
  const trust = metadataTrust(row)
  const tags = metadataTags(row)

  // One ERC-8004 lookup for all three parties (batched with any other
  // useAgentIdentities call mounting in the same render).
  const partyAddresses = useMemo(
    () => [row.committer, row.counterparty, row.arbiter],
    [row.committer, row.counterparty, row.arbiter],
  )
  const agents = useAgentIdentities(partyAddresses)
  const agentBadgeFor = (address: string) => {
    const a = agents.get(address)
    return a?.isAgent ? <AgentBadge agentId={a.agentId} /> : undefined
  }

  return (
    <div className="ds-stack ds-stack-6">
      {/* Terms lead. What this commitment is about is the second thing a
          reader should meet, right after the amount above. */}
      <CommitmentTerms
        trust={trust}
        description={metadataDescription(row)}
        termsURI={metadataTermsURI(row)}
        tags={tags}
        attestationId={metadataAttestationId(row)}
      />

      <LifecycleStepper steps={lifecycle} />

      {row.status === 'UNBONDING' &&
        unbondElapsed !== undefined &&
        unbondTotalSecs !== undefined && (
          <Countdown
            label="unbonding window"
            elapsed={unbondElapsed}
            total={unbondTotalSecs}
            tone={unbondElapsed >= unbondTotalSecs ? 'success' : 'info'}
          />
        )}

      <div className="ds-party-list">
        <PartyRow label="committer">
          <OperatorIdentity address={row.committer} size="sm" badge={agentBadgeFor(row.committer)} />
          {youOnCommitter && <span className="ds-badge ds-badge--solid">YOU</span>}
        </PartyRow>
        <PartyRow label="counterparty">
          {knownCounterparty ? (
            <span className="ds-row ds-row-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              {knownCounterparty.href ? (
                <Link to={knownCounterparty.href} title={knownCounterparty.description}>
                  {knownCounterparty.label}
                </Link>
              ) : (
                <span title={knownCounterparty.description}>{knownCounterparty.label}</span>
              )}
              <AddressDisplay address={row.counterparty} compact />
            </span>
          ) : (
            <OperatorIdentity address={row.counterparty} size="sm" badge={agentBadgeFor(row.counterparty)} />
          )}
          {youOnCounterparty && <span className="ds-badge ds-badge--solid">YOU</span>}
        </PartyRow>
        <PartyRow label="arbiter">
          <Link to={arbiterProfilePath(row.arbiter)}>
            <OperatorIdentity address={row.arbiter} size="sm" badge={agentBadgeFor(row.arbiter)} />
          </Link>
          {youOnArbiter && <span className="ds-badge ds-badge--solid">YOU</span>}
        </PartyRow>
        <PartyRow label="backing token">
          <AddressDisplay address={row.token} compact />
        </PartyRow>
        <PartyRow label="max penalty">
          <RiskRow bps={row.maxPenaltyBps} label="of stake" />
        </PartyRow>
      </div>

      {/* Anything that went wrong is loud and stays out of the disclosure —
          a reader must not have to expand a panel to learn that the text
          above them failed verification. */}
      {(trust === 'mismatch' || trust === 'unreachable') && (
        <MetadataProvenance
          trust={trust}
          uri={c.metadataURI}
          hash={nonZeroHash(c.metadataHash)}
          content={c.metadataContent}
          contentRaw={c.metadataContentRaw}
          withheldTitle={label.withheldTitle}
          onRefetch={onRefetchMetadata}
        />
      )}

      {/* Provenance in the good cases is a debugging surface, so it collapses.
          The raw payload opens only for a schema whose fields we do not
          render — there the dump genuinely is the content. */}
      {trust !== 'mismatch' && trust !== 'unreachable' && (c.metadataURI || trust !== 'none') && (
        <Disclosure label="metadata provenance">
          <MetadataProvenance
            trust={trust}
            uri={c.metadataURI}
            hash={nonZeroHash(c.metadataHash)}
            content={c.metadataContent}
            contentRaw={c.metadataContentRaw}
            defaultRawOpen={trust !== 'none' && !rendersSchema(row)}
            onRefetch={onRefetchMetadata}
          />
        </Disclosure>
      )}
    </div>
  )
}

const ZERO_HASH = `0x${'0'.repeat(64)}`

/** The zero hash means "no attestation", not "the hash is all zeroes". */
function nonZeroHash(hash: string | undefined): string | undefined {
  return hash && hash.toLowerCase() !== ZERO_HASH ? hash : undefined
}
