import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAbiItem, type Address } from 'viem'
import { usePublicClient, useReadContracts, useWatchContractEvent } from 'wagmi'
import { commitmentManagerAbi } from '../generated'
import {
  type AgreementProposalWithStatus,
  deriveAgreementStatus,
} from '../utils/agreements'

const agreementProposedEvent = getAbiItem({
  abi: commitmentManagerAbi,
  name: 'AgreementProposed',
})
const agreementProposedTermsEvent = getAbiItem({
  abi: commitmentManagerAbi,
  name: 'AgreementProposedTerms',
})
const agreementCancelledEvent = getAbiItem({
  abi: commitmentManagerAbi,
  name: 'AgreementProposalCancelled',
})
const agreementExpiredCancelledEvent = getAbiItem({
  abi: commitmentManagerAbi,
  name: 'AgreementProposalExpiredCancelled',
})
// Terminal lifecycle of an *accepted* agreement (keyed by agreementId, not
// proposalId): forfeiture by the arbiter vs. mutual release.
const agreementForfeitedEvent = getAbiItem({
  abi: commitmentManagerAbi,
  name: 'AgreementForfeited',
})
const agreementReleasedEvent = getAbiItem({
  abi: commitmentManagerAbi,
  name: 'AgreementReleased',
})

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

interface UseAgreementsParams {
  managerAddress: Address | undefined
  viewAddress: Address | undefined
}

interface UseAgreementsReturn {
  agreements: AgreementProposalWithStatus[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
  addOptimistic: (proposal: AgreementProposalWithStatus) => void
}

/**
 * Event-sourced proposal terms, joined from `AgreementProposed` (parties) +
 * `AgreementProposedTerms` (economic per-leg terms). `getAgreementProposal` was
 * removed from the manager — terms now live only in the emitted event, and
 * acceptance is read live via `agreementOfProposal(id) != 0`.
 */
interface ProposalRecord {
  proposalId: bigint
  proposer: Address
  acceptor: Address
  arbiter: Address
  proposerToken: Address
  proposerAdapter: Address
  proposerAmount: bigint
  proposerMaxPenaltyBps: number
  acceptorToken: Address
  acceptorAdapter: Address
  acceptorAmount: bigint
  acceptorMaxPenaltyBps: number
  challengeWindow: bigint
  expiresAt: bigint
  maxFlowProposerToAcceptor: bigint
  maxFlowAcceptorToProposer: bigint
  cancelled: boolean
  createdAtBlock?: bigint
}

export function useAgreements({
  managerAddress,
  viewAddress,
}: UseAgreementsParams): UseAgreementsReturn {
  const client = usePublicClient()
  const [records, setRecords] = useState<ProposalRecord[]>([])
  // agreementId (string) → terminal resolution, scanned from the agreement's own
  // lifecycle events. Absent ⇒ still ACTIVE.
  const [terminalMap, setTerminalMap] = useState<Map<string, 'FORFEITED' | 'RESOLVED'>>(new Map())
  const [isLoadingLogs, setIsLoadingLogs] = useState(true)
  const [logsError, setLogsError] = useState<Error | null>(null)
  // Optimistic entries prepended to the list until the next refetch
  const optimisticRef = useRef<AgreementProposalWithStatus[]>([])

  // ── Step 1: Event-sourced scan ──────────────────────────────────────────────
  // Scan AgreementProposed as proposer AND acceptor (both sides of the inbox),
  // then join the per-leg terms + cancellation state from their companion events.
  const fetchLogs = () => {
    if (!client || !managerAddress || !viewAddress) {
      setIsLoadingLogs(false)
      return
    }
    setIsLoadingLogs(true)
    setLogsError(null)

    Promise.all([
      client.getLogs({
        address: managerAddress,
        event: agreementProposedEvent,
        args: { proposer: viewAddress },
        fromBlock: 0n,
      }),
      client.getLogs({
        address: managerAddress,
        event: agreementProposedEvent,
        args: { acceptor: viewAddress },
        fromBlock: 0n,
      }),
    ])
      .then(async ([proposerLogs, acceptorLogs]) => {
        // Dedupe by proposalId, keeping parties + creation block from the event.
        const seen = new Set<string>()
        const base = new Map<
          string,
          { proposalId: bigint; proposer: Address; acceptor: Address; block?: bigint }
        >()
        for (const log of [...proposerLogs, ...acceptorLogs]) {
          const id = log.args.proposalId
          const proposer = log.args.proposer
          const acceptor = log.args.acceptor
          if (id === undefined || !proposer || !acceptor) continue
          const key = id.toString()
          if (seen.has(key)) continue
          seen.add(key)
          base.set(key, {
            proposalId: id,
            proposer,
            acceptor,
            block: log.blockNumber ?? undefined,
          })
        }

        const ids = [...base.values()].map((b) => b.proposalId)
        if (ids.length === 0) {
          setRecords([])
          optimisticRef.current = []
          setIsLoadingLogs(false)
          return
        }

        // Terms + cancellations are keyed by the indexed proposalId, so filter
        // each log query to just the ids we surfaced (OR-filter on the topic).
        const [termsLogs, cancelledLogs, expiredLogs] = await Promise.all([
          client.getLogs({
            address: managerAddress,
            event: agreementProposedTermsEvent,
            args: { proposalId: ids },
            fromBlock: 0n,
          }),
          client.getLogs({
            address: managerAddress,
            event: agreementCancelledEvent,
            args: { proposalId: ids },
            fromBlock: 0n,
          }),
          client.getLogs({
            address: managerAddress,
            event: agreementExpiredCancelledEvent,
            args: { proposalId: ids },
            fromBlock: 0n,
          }),
        ])

        const termsMap = new Map<string, (typeof termsLogs)[number]['args']>()
        for (const log of termsLogs) {
          const id = log.args.proposalId
          if (id !== undefined) termsMap.set(id.toString(), log.args)
        }
        const cancelledSet = new Set<string>()
        for (const log of [...cancelledLogs, ...expiredLogs]) {
          const id = log.args.proposalId
          if (id !== undefined) cancelledSet.add(id.toString())
        }

        const next: ProposalRecord[] = []
        for (const [key, b] of base) {
          const t = termsMap.get(key)
          // A proposal without its terms event is malformed (both are emitted in
          // the same tx) — skip rather than render a partial row.
          if (!t || t.arbiter === undefined) continue
          // Non-indexed args on a decoded log are typed `T | undefined`, but the
          // event emits all of them atomically — the `arbiter` guard above proves
          // the terms log decoded, so the rest are present.
          next.push({
            proposalId: b.proposalId,
            proposer: b.proposer,
            acceptor: b.acceptor,
            arbiter: t.arbiter,
            proposerToken: t.proposerToken!,
            proposerAdapter: t.proposerAdapter!,
            proposerAmount: t.proposerAmount!,
            proposerMaxPenaltyBps: Number(t.proposerMaxPenaltyBps!),
            acceptorToken: t.acceptorToken!,
            acceptorAdapter: t.acceptorAdapter!,
            acceptorAmount: t.acceptorAmount!,
            acceptorMaxPenaltyBps: Number(t.acceptorMaxPenaltyBps!),
            challengeWindow: BigInt(t.challengeWindow!),
            expiresAt: BigInt(t.expiresAt!),
            maxFlowProposerToAcceptor: t.maxFlowProposerToAcceptor!,
            maxFlowAcceptorToProposer: t.maxFlowAcceptorToProposer!,
            cancelled: cancelledSet.has(key),
            createdAtBlock: b.block,
          })
        }

        setRecords(next)
        optimisticRef.current = []
        setIsLoadingLogs(false)
      })
      .catch((err: unknown) => {
        // Surface the failure instead of silently presenting an empty inbox —
        // a failed RPC scan is otherwise indistinguishable from "no agreements".
        setLogsError(err instanceof Error ? err : new Error(String(err)))
        setIsLoadingLogs(false)
      })
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external subscription (RPC log scan); see frontend/docs/eslint-disable-rationale.md §Pattern-3
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, managerAddress, viewAddress])

  // ── Step 2: Acceptance enrichment — agreementOfProposal (0 ⇒ still open) ──────
  const {
    data: acceptanceData,
    isLoading: isLoadingData,
    error: multicallError,
    refetch: refetchMulticall,
  } = useReadContracts({
    contracts: records.map((r) => ({
      abi: commitmentManagerAbi,
      address: managerAddress!,
      functionName: 'agreementOfProposal' as const,
      args: [r.proposalId] as const,
    })),
    query: {
      enabled: records.length > 0 && !!managerAddress,
      refetchInterval: 15_000,
    },
  })

  // ── Step 2b: Terminal-status scan for accepted agreements ─────────────────────
  // An accepted proposal carries an agreementId; watch that agreement's own
  // lifecycle (AgreementForfeited / AgreementReleased) so resolved rows leave
  // ACTIVE instead of showing live forever.
  const acceptedAgreementIds = useMemo<bigint[]>(() => {
    if (!acceptanceData) return []
    const ids: bigint[] = []
    for (let i = 0; i < records.length; i++) {
      const res = acceptanceData[i]
      if (res?.status === 'success') {
        const id = res.result as bigint
        if (id > 0n) ids.push(id)
      }
    }
    return ids
  }, [acceptanceData, records])

  const scanTerminal = useCallback(() => {
    if (!client || !managerAddress || acceptedAgreementIds.length === 0) {
      setTerminalMap(new Map())
      return
    }
    Promise.all([
      client.getLogs({
        address: managerAddress,
        event: agreementForfeitedEvent,
        args: { agreementId: acceptedAgreementIds },
        fromBlock: 0n,
      }),
      client.getLogs({
        address: managerAddress,
        event: agreementReleasedEvent,
        args: { agreementId: acceptedAgreementIds },
        fromBlock: 0n,
      }),
    ])
      .then(([forfeitedLogs, releasedLogs]) => {
        const map = new Map<string, 'FORFEITED' | 'RESOLVED'>()
        for (const log of releasedLogs) {
          const id = log.args.agreementId
          if (id !== undefined) map.set(id.toString(), 'RESOLVED')
        }
        // Forfeiture is the stronger terminal state — apply it last so it wins
        // if an agreement ever emitted both.
        for (const log of forfeitedLogs) {
          const id = log.args.agreementId
          if (id !== undefined) map.set(id.toString(), 'FORFEITED')
        }
        setTerminalMap(map)
      })
      // A failed scan must not blank ACTIVE rows — keep the prior map.
      .catch(() => {})
  }, [client, managerAddress, acceptedAgreementIds])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external subscription (RPC log scan); see frontend/docs/eslint-disable-rationale.md §Pattern-3
    scanTerminal()
  }, [scanTerminal])

  // ── Step 3: Build AgreementProposalWithStatus[] sorted newest-first ───────────
  const agreements: AgreementProposalWithStatus[] = (() => {
    if (records.length === 0) return []

    const result: AgreementProposalWithStatus[] = []

    for (let i = 0; i < records.length; i++) {
      const r = records[i]
      if (!r.proposer || r.proposer.toLowerCase() === ZERO_ADDRESS) continue

      const acceptanceResult = acceptanceData?.[i]
      const agreementIdRaw =
        acceptanceResult?.status === 'success'
          ? (acceptanceResult.result as bigint)
          : 0n
      const accepted = agreementIdRaw > 0n

      const viewerIsProposer =
        !!viewAddress && viewAddress.toLowerCase() === r.proposer.toLowerCase()

      // Accepted proposals display as ACTIVE unless their agreement has reached a
      // terminal state (FORFEITED / RESOLVED), scanned in Step 2b.
      const resolvedStatus = accepted ? terminalMap.get(agreementIdRaw.toString()) : undefined
      const status = deriveAgreementStatus(
        {
          accepted,
          cancelled: r.cancelled,
          expiresAt: r.expiresAt,
        },
        resolvedStatus,
      )

      result.push({
        proposalId: r.proposalId,
        proposer: r.proposer,
        acceptor: r.acceptor,
        arbiter: r.arbiter,
        // Headline token/adapter = proposer leg (see AgreementProposalWithStatus).
        token: r.proposerToken,
        adapter: r.proposerAdapter,
        proposerAmount: r.proposerAmount,
        acceptorAmount: r.acceptorAmount,
        maxPenaltyBps: r.proposerMaxPenaltyBps,
        challengeWindow: r.challengeWindow,
        expiresAt: r.expiresAt,
        accepted,
        cancelled: r.cancelled,
        status,
        proposerToken: r.proposerToken,
        proposerAdapter: r.proposerAdapter,
        acceptorToken: r.acceptorToken,
        acceptorAdapter: r.acceptorAdapter,
        acceptorMaxPenaltyBps: r.acceptorMaxPenaltyBps,
        maxFlowProposerToAcceptor: r.maxFlowProposerToAcceptor,
        maxFlowAcceptorToProposer: r.maxFlowAcceptorToProposer,
        agreementId: accepted ? agreementIdRaw : undefined,
        // commitmentIdA/B: derivable via getAgreementPair(agreementId) when needed.
        viewerIsProposer,
        createdAtBlock: r.createdAtBlock,
      })
    }

    // Sort newest-first by createdAtBlock (D-04)
    result.sort((a, b) => {
      const aBlock = a.createdAtBlock ?? 0n
      const bBlock = b.createdAtBlock ?? 0n
      return aBlock > bBlock ? -1 : aBlock < bBlock ? 1 : 0
    })

    // Prepend any optimistic entries not yet replaced by on-chain data.
    // See frontend/docs/eslint-disable-rationale.md §Pattern-4 for the
    // rationale on render-time ref reads in optimistic-update hooks.
    // eslint-disable-next-line react-hooks/refs -- intentional render-time read for optimistic-update merge; see frontend/docs/eslint-disable-rationale.md §Pattern-4
    const optimistic = optimisticRef.current.filter(
      (opt) => !result.some((rr) => rr.proposalId === opt.proposalId),
    )
    return [...optimistic, ...result]
  })()

  // ── Step 4: Real-time watchers — re-scan on new AgreementProposed ─────────────
  // Two watchers: one for proposer side, one for acceptor side.
  useWatchContractEvent({
    address: managerAddress,
    abi: commitmentManagerAbi,
    eventName: 'AgreementProposed',
    args: { proposer: viewAddress },
    enabled: !!managerAddress && !!viewAddress,
    onLogs: () => {
      fetchLogs()
    },
  })

  useWatchContractEvent({
    address: managerAddress,
    abi: commitmentManagerAbi,
    eventName: 'AgreementProposed',
    args: { acceptor: viewAddress },
    enabled: !!managerAddress && !!viewAddress,
    onLogs: () => {
      fetchLogs()
    },
  })

  // Re-scan terminal status when one of our accepted agreements forfeits or
  // releases, so a live row transitions to FORFEITED / RESOLVED without a reload.
  useWatchContractEvent({
    address: managerAddress,
    abi: commitmentManagerAbi,
    eventName: 'AgreementForfeited',
    enabled: !!managerAddress && acceptedAgreementIds.length > 0,
    onLogs: () => {
      scanTerminal()
    },
  })

  useWatchContractEvent({
    address: managerAddress,
    abi: commitmentManagerAbi,
    eventName: 'AgreementReleased',
    enabled: !!managerAddress && acceptedAgreementIds.length > 0,
    onLogs: () => {
      scanTerminal()
    },
  })

  // ── Step 5: Optimistic update ─────────────────────────────────────────────────
  const addOptimistic = (proposal: AgreementProposalWithStatus) => {
    optimisticRef.current = [proposal, ...optimisticRef.current]
    // Immediately trigger a log rescan to pick up the real event
    fetchLogs()
  }

  function refetch() {
    fetchLogs()
    void refetchMulticall()
  }

  const error = logsError ?? (multicallError as Error | null) ?? null

  return {
    agreements,
    isLoading: isLoadingLogs || (records.length > 0 && isLoadingData),
    isError: error !== null,
    error,
    refetch,
    addOptimistic,
  }
}
