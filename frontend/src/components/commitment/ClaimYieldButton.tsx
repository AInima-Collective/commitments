import { useState } from 'react'
import { type Address, type Hex } from 'viem'
import { commitmentManagerAbi } from '../../generated'
import { useWriteAction } from '../../hooks/useWriteAction'
import {
  AddressDisplay,
  Button,
  Modal,
  TokenAmount,
  UsdAmount,
} from '../ui'

interface ClaimYieldButtonProps {
  commitmentId: bigint
  managerAddress: Address | undefined
  isConnected: boolean
  connectedAddress: Address | undefined
  viewAddress: Address | undefined
  pendingAmount: bigint
  /** USD value of the pending amount in 6-decimal bigint shape. `null` =
   *  price unavailable; the modal then leads with shares only. */
  usdAmount?: bigint | null
  /** Committer address — surfaced in the confirmation modal. */
  depositorAddress?: Address
  /** Backing-token decimals + symbol — for the amount line in the modal (v2:
   *  yield is denominated in the commitment's own token, not the vault share). */
  decimals?: number
  symbol?: string
  /**
   * v2 distribution strategy to claim from, plus the strategy-specific
   * claimData. `claim(id, strategy, claimData)` is per-(commitment, strategy);
   * the panel supplies one entry per binding. Claim is gated off when `strategy`
   * is absent (e.g. design-system previews).
   */
  strategy?: Address
  claimData?: Hex
  onClaimed?: (id: bigint) => void
}

/**
 * ClaimYieldButton — per-row CLAIM action on ClaimableYieldPanel.
 *
 * Standard write-button lifecycle (useWriteAction: error toast, 3s success
 * auto-clear).
 *
 * Spectator-mode gate (WARNING W11): the button is disabled when the connected
 * wallet does NOT match `viewAddress` (the address the user is inspecting).
 * In spectator mode we cannot claim because msg.sender on-chain would not be
 * the counterparty named on the commitment. Title: "Connect as recipient to claim".
 *
 * Confirmation modal: clicking CLAIM opens a small modal that surfaces the
 * depositor, commitment id, and full-precision amount before firing the
 * write. Confirm fires the tx; cancel just closes the modal.
 */
export function ClaimYieldButton({
  commitmentId,
  managerAddress,
  isConnected,
  connectedAddress,
  viewAddress,
  pendingAmount,
  usdAmount,
  depositorAddress,
  decimals,
  symbol,
  strategy,
  claimData,
  onClaimed,
}: ClaimYieldButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  // On success: notify the panel for optimistic removal + toast emission. The
  // success toast is pushed from the panel so the tone+body stay co-located
  // with the row data; this button only emits the error toast.
  const { write: writeContract, isPending, isConfirming } = useWriteAction({
    onSuccess: () => {
      onClaimed?.(commitmentId)
      setConfirmOpen(false)
    },
    onError: () => setConfirmOpen(false),
  })

  const isViewerConnected =
    !!connectedAddress &&
    !!viewAddress &&
    connectedAddress.toLowerCase() === viewAddress.toLowerCase()


  function handleConfirm() {
    // v2 claim is per-(commitment, strategy): claim(id, strategy, claimData).
    if (!managerAddress || !strategy) return
    writeContract({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'claim',
      args: [commitmentId, strategy, claimData ?? ('0x' as Hex)],
    })
  }

  let disabledTitle: string | undefined
  if (!isConnected) {
    disabledTitle = 'Connect wallet to claim'
  } else if (!isViewerConnected) {
    disabledTitle = 'Connect as recipient to claim'
  } else if (pendingAmount === 0n) {
    disabledTitle = 'No yield to claim'
  }

  const isPendingAny = isPending || isConfirming
  const disabled =
    !isConnected ||
    !isViewerConnected ||
    isPendingAny ||
    pendingAmount === 0n ||
    !managerAddress

  const dec = decimals ?? 18
  const showUsd = usdAmount !== undefined && usdAmount !== null

  return (
    <>
      <Button
        size="sm"
        variant="primary"
        onClick={() => setConfirmOpen(true)}
        disabled={disabled}
        title={disabledTitle}
      >
        {isPendingAny ? 'CLAIMING…' : 'CLAIM'}
      </Button>

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (isPendingAny) return
          setConfirmOpen(false)
        }}
        size="sm"
        title="Confirm yield claim"
        description="Pulls accrued yield from the commitment to your address."
        footer={
          <div className="ds-row ds-row-2" style={{ justifyContent: 'flex-end' }}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={isPendingAny}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleConfirm}
              disabled={isPendingAny || !managerAddress}
            >
              {isPendingAny ? 'Confirming…' : 'Confirm claim'}
            </Button>
          </div>
        }
      >
        <div className="ds-stack ds-stack-3">
          <div className="ds-row" style={{ justifyContent: 'space-between' }}>
            <span className="ds-text-xs ds-subtle">COMMITMENT</span>
            <span className="ds-mono-num">#{commitmentId.toString()}</span>
          </div>
          {depositorAddress && (
            <div className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="ds-text-xs ds-subtle">DEPOSITOR</span>
              <AddressDisplay address={depositorAddress} compact />
            </div>
          )}
          <div className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="ds-text-xs ds-subtle">AMOUNT</span>
            <div className="ds-stack ds-stack-1" style={{ textAlign: 'right' }}>
              {showUsd && <UsdAmount amount={usdAmount} size="default" />}
              <span className="ds-text-xs ds-subtle">
                <TokenAmount
                  amount={pendingAmount}
                  decimals={dec}
                  symbol={symbol ?? 'TOKEN'}
                  size="inline"
                />
              </span>
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
