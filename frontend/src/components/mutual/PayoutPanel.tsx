import { type Address } from 'viem'

import { Button, Card, Notice, StatBlock, TokenAmount, useToasts } from '../ui'
import { OperatorIdentity } from '../protocol'
import { claimRouterAbi, commitmentManagerAbi } from '../../generated'
import { useWriteAction } from '../../hooks/useWriteAction'
import { type ClaimPayout } from '../../hooks/useClaimPayout'

interface PayoutPanelProps {
  /** The mutual's beneficiary — the ClaimRouter the collect writes target. */
  routerAddress: Address
  /** The custody root — target of the permissionless settle crank. */
  managerAddress: Address
  /** Router/claimant/collectable state from {@link useClaimPayout}. */
  payout: ClaimPayout
  /** The mutual numeraire the payout is denominated in. */
  token: Address
  decimals: number
  symbol: string
  viewAddress: Address
  /** True while the declared loss is still inside its challenge window. */
  lossPending: boolean
  /** Member commitment ids that still owe an unsettled loss share —
   *  `settleAndCollect` cranks these before collecting. */
  unsettledIds: bigint[]
  /** Σ owedUnits across those members — the "still settling" figure. */
  owedOutstanding: bigint
  /** Refetch page state after a confirmed collect. */
  onCollected?: () => void
}

/**
 * PayoutPanel — answers the policyholder's post-loss question ("how do I get
 * paid?") in place. Settled member shares accumulate in the mutual's
 * ClaimRouter; the designated claimant collects them out. For the claimant
 * this panel is the payout action itself — one `settleAndCollect` cranks any
 * unsettled members and transfers the recovered funds in a single tx. For a
 * cover holder who is not the claimant, it says who is — and still offers the
 * permissionless settle crank (`manager.settleMembers`): anyone willing to
 * pay the gas can force the recovery into the router; only collection is
 * claimant-gated on-chain.
 */
export function PayoutPanel({
  routerAddress,
  managerAddress,
  payout,
  token,
  decimals,
  symbol,
  viewAddress,
  lossPending,
  unsettledIds,
  owedOutstanding,
  onCollected,
}: PayoutPanelProps) {
  const { push } = useToasts()

  // One write per click: `settleAndCollect` or `collect`.
  const collect = useWriteAction({
    successTitle: 'PAYOUT COLLECTED',
    successBody: 'Recovered funds transferred to your wallet.',
    errorTitle: 'COLLECT FAILED',
    onSuccess: () => {
      payout.refetch()
      onCollected?.()
    },
  })
  const busy = collect.isPending || collect.isConfirming

  // Settle-only crank for non-claimants: `manager.settleMembers` is
  // permissionless, so any connected wallet can pay the gas to force the
  // outstanding shares into the router. Only `collect` is claimant-gated.
  const settleOnly = useWriteAction({
    successTitle: 'MEMBERS SETTLED',
    successBody: 'The outstanding shares moved into the claim router.',
    errorTitle: 'SETTLE FAILED',
    onSuccess: () => {
      payout.refetch()
      onCollected?.()
    },
  })
  const settleBusy = settleOnly.isPending || settleOnly.isConfirming

  const needsSettle = unsettledIds.length > 0
  const nothingToCollect = payout.collectable === 0n && !needsSettle

  function onSettleOnly() {
    settleOnly.write(
      {
        abi: commitmentManagerAbi,
        address: managerAddress,
        functionName: 'settleMembers',
        args: [unsettledIds],
      },
      {
        onSuccess: () =>
          push({ tone: 'info', title: 'SETTLE SUBMITTED', body: 'Awaiting confirmation…' }),
      },
    )
  }

  function onCollect() {
    const callbacks = {
      onSuccess: () =>
        push({ tone: 'info' as const, title: 'COLLECT SUBMITTED', body: 'Awaiting confirmation…' }),
    }
    if (needsSettle) {
      collect.write(
        {
          abi: claimRouterAbi,
          address: routerAddress,
          functionName: 'settleAndCollect',
          args: [unsettledIds, token, viewAddress],
        },
        callbacks,
      )
    } else {
      collect.write(
        { abi: claimRouterAbi, address: routerAddress, functionName: 'collect', args: [token, viewAddress] },
        callbacks,
      )
    }
  }

  return (
    <section className="ds-stack ds-stack-2" aria-label="Your payout">
      <h3 className="ds-section-eyebrow">Your payout</h3>
      <Card className="ds-stack ds-stack-3">
        {lossPending ? (
          <Notice tone="info" size="sm" title="Payout pending the challenge window">
            The declared loss can still be challenged. Once it executes, members settle their
            shares into the claim router and the claimant collects from there — the countdown
            above tracks the window.
          </Notice>
        ) : (
          <div className="ds-stat-grid" data-cols="2">
            <StatBlock
              label="recovered · awaiting collection"
              tone={payout.collectable > 0n ? 'accent' : 'neutral'}
              value={
                <TokenAmount amount={payout.collectable} decimals={decimals} symbol={symbol} compact />
              }
              meta="settled shares held by the claim router"
            />
            <StatBlock
              label="not yet settled"
              tone={owedOutstanding > 0n ? 'neutral' : 'success'}
              value={
                <TokenAmount amount={owedOutstanding} decimals={decimals} symbol={symbol} compact />
              }
              meta={
                owedOutstanding > 0n
                  ? 'one settle transaction moves this into the router — no waiting on members'
                  : 'all member shares settled'
              }
            />
          </div>
        )}

        {payout.isClaimant ? (
          <div className="ds-stack ds-stack-1">
            <Button onClick={onCollect} disabled={busy || lossPending || nothingToCollect}>
              {busy
                ? 'Collecting…'
                : needsSettle
                  ? 'Settle members & collect payout'
                  : 'Collect payout'}
            </Button>
            <span className="ds-text-xs ds-subtle">
              {lossPending
                ? 'Collection opens once the loss executes.'
                : nothingToCollect
                  ? 'Nothing to collect yet.'
                  : needsSettle
                    ? 'One transaction settles the outstanding member shares and transfers everything recovered to your wallet. Settlement is permissionless — you never wait on a member.'
                    : 'Transfers the recovered funds to your wallet.'}
            </span>
          </div>
        ) : payout.isRouter && payout.claimant ? (
          <Notice tone="info" size="sm" title="You're covered — the claimant collects">
            Payouts route through this mutual's claim router. The designated claimant is{' '}
            <OperatorIdentity address={payout.claimant} size="sm" />. Only collection is
            claimant-gated — anyone can settle the outstanding shares into the router below.
          </Notice>
        ) : (
          <Notice tone="info" size="sm" title="Payout routed by the beneficiary">
            This mutual's beneficiary is not a claim router — recovered funds settle to{' '}
            <OperatorIdentity address={routerAddress} size="sm" />, which routes payouts outside
            this app.
          </Notice>
        )}

        {/* Permissionless settle crank for non-claimants: pays the gas to
            force outstanding shares into the router now, instead of waiting
            for the claimant or a keeper to do it. */}
        {!payout.isClaimant && needsSettle && !lossPending && (
          <div className="ds-stack ds-stack-1">
            <Button onClick={onSettleOnly} disabled={settleBusy}>
              {settleBusy ? 'Settling…' : 'Settle members now'}
            </Button>
            <span className="ds-text-xs ds-subtle">
              Settlement is permissionless — you pay the gas and the outstanding shares move to the
              beneficiary immediately. You never wait on a member
              {payout.isRouter ? '; the claimant then collects.' : '.'}
            </span>
          </div>
        )}
      </Card>
    </section>
  )
}
