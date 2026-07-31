import { Notice } from '../ui'
import { formatDuration } from '../../lib/format'

interface FrozenCapacityDisclosureProps {
  /** Deallocation window in seconds — how long capital stays slashable after exit. */
  deallocationWindow: bigint
  /** Challenge window in seconds — how long a proposed loss can be vetoed. */
  challengeWindow: bigint
  /**
   * Live freeze: a bonded loss is currently under challenge, so capacity is
   * frozen and joins/exits are paused until it resolves. Promotes the notice to
   * `warn` and prepends a leading line.
   */
  frozen?: boolean
  tone?: 'info' | 'warn'
}

/**
 * FrozenCapacityDisclosure — explains that joining freezes capital: an exit
 * only starts a deallocation window, during which the member's units remain
 * slashable by any loss the arbiter executes. Pure disclosure copy; the live
 * countdown lives in PendingLossNotice when an exit is actually pending.
 */
export function FrozenCapacityDisclosure({
  deallocationWindow,
  challengeWindow,
  frozen = false,
  tone = 'info',
}: FrozenCapacityDisclosureProps) {
  return (
    <Notice
      tone={frozen ? 'warn' : tone}
      size="sm"
      title="Capital is frozen while you're a member"
    >
      <ul className="ds-list">
        {frozen && (
          <li>
            <strong>A loss is currently under challenge</strong> — capacity is frozen and new joins
            are paused until it executes or is cancelled.
          </li>
        )}
        <li>
          Your posted units back the mutual for its full term. Requesting exit does not
          release capital immediately — it opens a{' '}
          <strong>{formatDuration(Number(deallocationWindow))}</strong> deallocation window.
        </li>
        <li>
          Throughout that window your units stay <strong>slashable</strong>: any loss the arbiter
          executes still draws on them pro-rata.
        </li>
        <li>
          A proposed loss has a <strong>{formatDuration(Number(challengeWindow))}</strong> challenge
          window before it can execute, so settlement is never same-block.
        </li>
        <li>Capital is fully released only once the window elapses and any owed loss share settles.</li>
      </ul>
    </Notice>
  )
}
