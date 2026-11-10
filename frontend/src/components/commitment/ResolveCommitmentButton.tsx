import { useState } from 'react'
import { type Address } from 'viem'
import { type CommitmentWithStatus } from '../../utils/commitments'
import { Button } from '../ui'
import { ResolveCommitmentModal } from './ResolveCommitmentModal'

interface ResolveCommitmentButtonProps {
  commitment: CommitmentWithStatus
  managerAddress: Address
  connectedAddress: Address | undefined
  isConnected: boolean
  onActed?: () => void
  /** Trigger label. Defaults to "Resolve"; staking surfaces pass "Undelegate". */
  label?: string
}

/**
 * Single primary action button for each commitment row. Click opens the
 * `<ResolveCommitmentModal>` which shows every action the connected viewer
 * can take. The button itself is always enabled — even spectators can open
 * the modal in read-only mode to see *why* they can't act.
 */
export function ResolveCommitmentButton({
  commitment,
  managerAddress,
  connectedAddress,
  isConnected,
  onActed,
  label = 'Resolve',
}: ResolveCommitmentButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {label}
      </Button>
      {/* Mounted only while open: the modal body runs a clock and several reads. */}
      {open && (
        <ResolveCommitmentModal
          open
          onClose={() => setOpen(false)}
          commitment={commitment}
          managerAddress={managerAddress}
          connectedAddress={connectedAddress}
          isConnected={isConnected}
          onActed={onActed}
        />
      )}
    </>
  )
}
