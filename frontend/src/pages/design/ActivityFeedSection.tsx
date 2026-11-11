import { parseEther } from 'viem'
import {
  AddressDisplay,
  EmptyState,
  SourceBlock,
  TokenAmount,
} from '../../components/ui'
import { ActivityFeed, type ActivityEvent } from '../../components/protocol'
import { SectionHeading } from './SectionHeading'

// Anchored to page load so the date headings read Today / Yesterday / N days ago.
const NOW_S = Math.floor(Date.now() / 1000)
const HOUR = 3600
const DAY = 24 * HOUR

const EVENTS: ActivityEvent[] = [
  {
    id: 'e1',
    type: 'forfeit-proposed',
    timestamp: NOW_S - 2 * HOUR,
    title: 'Forfeit proposed on commitment #28',
    meta: <span>by <AddressDisplay address="0x15d34aaf54267db7d7c367839aaf71a00a2c6a65" /></span>,
    trailing: <span className="ds-text-xs ds-subtle">Review →</span>,
    onClick: () => undefined,
    actionLabel: 'Review commitment #28',
  },
  {
    id: 'e2',
    type: 'deposit',
    timestamp: NOW_S - 3 * HOUR,
    title: 'Deposited into the USDC vault',
    trailing: <TokenAmount amount={parseEther('1.5')} decimals={18} symbol="ETH" />,
  },
  {
    id: 'e3',
    type: 'yield-distributed',
    timestamp: NOW_S - 5 * HOUR,
    title: 'Yield distributed',
    trailing: <TokenAmount amount={parseEther('0.012')} decimals={18} symbol="ETH" />,
  },
  {
    id: 'e4',
    type: 'proposal-received',
    timestamp: NOW_S - DAY - 4 * HOUR,
    title: 'Agreement proposed by Pinax',
    meta: '5 ETH ↔ 2,500 USDC',
  },
  {
    id: 'e5',
    type: 'commitment-created',
    timestamp: NOW_S - DAY - 6 * HOUR,
    title: 'Commitment #42 created',
  },
  {
    id: 'e6',
    type: 'commitment-released',
    timestamp: NOW_S - 3 * DAY,
    title: 'Commitment #27 released',
    trailing: <TokenAmount amount={parseEther('8')} decimals={18} symbol="ETH" />,
  },
]

const SRC_ACTIVITY_FEED =
  `// Copy is the call site's; tone and glyph come from the event type.
const events: ActivityEvent[] = rows.map((r) => ({
  id: r.id,
  type: 'forfeit-proposed',
  timestamp: r.blockTimestamp,
  title: \`Forfeit proposed on commitment #\${r.commitmentId}\`,
  onClick: () => open(r),
  actionLabel: \`Review commitment #\${r.commitmentId}\`,
}))

<ActivityFeed
  events={events}
  isLoading={isLoading && events.length === 0}
  emptyState={<EmptyState title="NO ACTIVITY" description="…" />}
/>`

export function ActivityFeedSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="activity-feed"
        title="Activity Feed"
        lead="The protocol's event stream, composed over MediaRow. The event type fixes the tone and glyph; the call site supplies title, meta, and trailing copy. Rows group under date headings and page client-side behind Show more."
      />
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">grouped by date · page size 5</div>
        <ActivityFeed events={EVENTS} pageSize={5} />
      </div>
      <div className="ds-grid-2" style={{ alignItems: 'start' }}>
        <div className="ds-stack ds-stack-3">
          <div className="ds-label">loading</div>
          <ActivityFeed events={[]} isLoading />
        </div>
        <div className="ds-stack ds-stack-3">
          <div className="ds-label">empty</div>
          <ActivityFeed
            events={[]}
            emptyState={
              <EmptyState
                title="NO ACTIVITY"
                description="Your recent commitments, proposals, and vault movements will appear here."
              />
            }
          />
        </div>
      </div>
      <SourceBlock label="example" source={SRC_ACTIVITY_FEED} />
    </section>
  )
}
