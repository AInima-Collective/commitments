import { parseEther } from 'viem'
import {
  Card,
  QuorumMeter,
  VoteTallyBar,
} from '../../components/ui'
import {
  ProposalActionRow,
  ProposalKindBadge,
  ProposalStateBadge,
  ProposalTimeline,
  SupportBadge,
} from '../../components/protocol'
import { SectionHeading } from './SectionHeading'

function GovernanceDemo() {
  const proposalStates = [
    'pending',
    'active',
    'succeeded',
    'queued',
    'executed',
    'defeated',
    'canceled',
    'expired',
  ] as const
  const proposalKinds = ['weight_update', 'forfeit_arbitration', 'treasury', 'signaling', 'mixed'] as const
  return (
    <div className="ds-stack ds-stack-6">
      <div className="ds-stack ds-stack-2">
        <div className="ds-text-sm ds-muted">ProposalStateBadge — eight lifecycle states</div>
        <div className="ds-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {proposalStates.map((s) => (
            <ProposalStateBadge key={s} state={s} />
          ))}
        </div>
      </div>

      <div className="ds-stack ds-stack-2">
        <div className="ds-text-sm ds-muted">ProposalKindBadge — five action shapes</div>
        <div className="ds-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {proposalKinds.map((k) => (
            <ProposalKindBadge key={k} kind={k} />
          ))}
        </div>
      </div>

      <div className="ds-stack ds-stack-2">
        <div className="ds-text-sm ds-muted">SupportBadge — for / against / abstain</div>
        <div className="ds-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <SupportBadge support={1} />
          <SupportBadge support={0} />
          <SupportBadge support={2} />
        </div>
      </div>

      <div className="ds-stack ds-stack-2">
        <div className="ds-text-sm ds-muted">VoteTallyBar — for/against/abstain over voting power</div>
        <Card>
          <VoteTallyBar
            forVotes={parseEther('600')}
            againstVotes={parseEther('200')}
            abstainVotes={parseEther('100')}
          />
        </Card>
        <Card>
          <VoteTallyBar forVotes={0n} againstVotes={0n} abstainVotes={0n} />
        </Card>
      </div>

      <div className="ds-stack ds-stack-2">
        <div className="ds-text-sm ds-muted">QuorumMeter — progress to quorum</div>
        <Card>
          <QuorumMeter progress={parseEther('700')} target={parseEther('400')} />
        </Card>
      </div>

      <div className="ds-stack ds-stack-2">
        <div className="ds-text-sm ds-muted">ProposalTimeline — five-step lifecycle</div>
        <div className="ds-stack ds-stack-3">
          <Card>
            <ProposalTimeline state="active" />
          </Card>
          <Card>
            <ProposalTimeline state="executed" />
          </Card>
          <Card>
            <ProposalTimeline state="defeated" />
          </Card>
        </div>
      </div>

      <div className="ds-stack ds-stack-2">
        <div className="ds-text-sm ds-muted">ProposalActionRow — per-kind action card</div>
        <div className="ds-stack ds-stack-3">
          <Card>
            <ProposalActionRow
              index={0}
              target="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              value={0n}
              calldata="0x0000000000000000000000000000000000000000000000000000000000000000"
              kind="weight_update"
              decoded={{
                tokenWeighting: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                denom: '0xdededededededededededededededededededededededededededededededede',
                newWeightBps: '9000',
              }}
            />
          </Card>
          <Card>
            <ProposalActionRow
              index={0}
              target="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              value={0n}
              calldata="0x00000000"
              kind="forfeit_arbitration"
              decoded={{
                manager: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                op: 'initiateForfeit',
                commitmentId: '42',
                penaltyBps: 2500,
              }}
            />
          </Card>
          <Card>
            <ProposalActionRow
              index={0}
              target="0xcccccccccccccccccccccccccccccccccccccccc"
              value={0n}
              calldata="0x"
              kind="signaling"
              decoded={null}
            />
          </Card>
        </div>
      </div>
    </div>
  )
}

export function GovernanceSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="governance"
        title="Governance"
        lead="DAO proposal lifecycle primitives. ProposalStateBadge mirrors OZ Governor's eight-state machine; ProposalKindBadge distinguishes the four powers (weight update, forfeit arbitration, treasury, signaling). VoteTallyBar composes AllocationBar; QuorumMeter composes CapacityMeter. ProposalTimeline composes LifecycleStepper."
      />
      <GovernanceDemo />
    </section>
  )
}
