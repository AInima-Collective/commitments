import { parseEther } from 'viem'
import {
  Button,
  SourceBlock,
  TokenAmount,
} from '../../components/ui'
import {
  CommitmentStatusBadge,
  Countdown,
  LifecycleStepper,
  MetadataSummary,
  OperatorIdentity,
  PartyRow,
  RiskRow,
  commitmentLifecycle,
  type CommitmentStatus,
} from '../../components/protocol'
import { formatPercent, truncateAddress as truncateAddr } from '../../lib/format'
import { SectionHeading } from './SectionHeading'

const SRC_COMMITMENTS =
  `<CommitmentStatusBadge status="FORFEIT_PENDING" />
<LifecycleStepper steps={commitmentLifecycle('FORFEIT_PENDING')} />
<Countdown label="forfeit execution delay" elapsed={3600 * 4} total={3600 * 24} tone="warn" />`

export function CommitmentsSection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="commitments"
        title="Commitments"
        lead="The protocol's core primitive: a committer pre-locks vault shares, names an arbiter, and accepts two-phase manager enforcement. The UI must answer at-a-glance: who's bound, what's at stake, what penalty range, where in the lifecycle, and how long until the next state transition."
      />

      {/* Status badges */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">status · vocabulary</div>
        <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
          {(['PROPOSED', 'ACTIVE', 'FORFEIT_PENDING', 'FORFEITED', 'RELEASED', 'EXPIRED'] as CommitmentStatus[]).map((s) => (
            <CommitmentStatusBadge key={s} status={s} />
          ))}
        </div>
        <div className="ds-text-xs ds-subtle" style={{ maxWidth: '60ch' }}>
          PROPOSED applies to agreements pre-acceptance; simple commitments enter ACTIVE on
          creation. FORFEIT_PENDING is the manager-enforcement intermediate. RELEASED, FORFEITED, and
          EXPIRED are terminal. Precedence: forfeited → released → forfeit-pending → expired → active.
        </div>
      </div>

      {/* Lifecycle stepper */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">lifecycle · stepper</div>
        <div className="ds-stack ds-stack-6">
          <div className="ds-stack ds-stack-2">
            <div className="ds-row ds-row-3"><span className="ds-text-sm ds-muted">happy path · active</span><CommitmentStatusBadge status="ACTIVE" /></div>
            <LifecycleStepper steps={commitmentLifecycle('ACTIVE')} />
          </div>
          <div className="ds-stack ds-stack-2">
            <div className="ds-row ds-row-3"><span className="ds-text-sm ds-muted">arbiter proposed forfeit</span><CommitmentStatusBadge status="FORFEIT_PENDING" /></div>
            <LifecycleStepper steps={commitmentLifecycle('FORFEIT_PENDING')} />
          </div>
          <div className="ds-stack ds-stack-2">
            <div className="ds-row ds-row-3"><span className="ds-text-sm ds-muted">forfeit executed</span><CommitmentStatusBadge status="FORFEITED" /></div>
            <LifecycleStepper steps={commitmentLifecycle('FORFEITED')} />
          </div>
          <div className="ds-stack ds-stack-2">
            <div className="ds-row ds-row-3"><span className="ds-text-sm ds-muted">released by arbiter</span><CommitmentStatusBadge status="RELEASED" /></div>
            <LifecycleStepper steps={commitmentLifecycle('RELEASED')} />
          </div>
          <div className="ds-stack ds-stack-2">
            <div className="ds-row ds-row-3"><span className="ds-text-sm ds-muted">depositor self-released after expiry</span><CommitmentStatusBadge status="EXPIRED" /></div>
            <LifecycleStepper steps={commitmentLifecycle('EXPIRED')} />
          </div>
        </div>
      </div>

      {/* Countdown */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">window · countdown</div>
        <div className="ds-stack ds-stack-4">
          <Countdown label="forfeit execution delay" elapsed={3600 * 4} total={3600 * 24} tone="warn" />
          <Countdown label="forfeit execution delay · final hour" elapsed={3600 * 23} total={3600 * 24} tone="danger" />
          <Countdown label="expires in" elapsed={86400 * 14} total={86400 * 30} tone="info" />
          <Countdown label="self-release available" elapsed={86400 * 30} total={86400 * 30} tone="success" />
        </div>
      </div>

      {/* Party list */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">parties · roles</div>
        <div className="ds-surface" style={{ padding: 'var(--space-4)' }}>
          <div className="ds-party-list">
            <PartyRow label="depositor">
              <OperatorIdentity
                address="0xC4f7000000000000000000000000000000003Ab9"
                name="Pellar Labs"
                size="sm"
                hideAddress
              />
              <span className="ds-text-xs ds-subtle">{truncateAddr('0xC4f7000000000000000000000000000000003Ab9')}</span>
              <span className="ds-badge ds-badge--solid">YOU</span>
            </PartyRow>
            <PartyRow label="counterparty">
              <OperatorIdentity
                address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                name="Pinax"
                size="sm"
                hideAddress
              />
              <span className="ds-text-xs ds-subtle">{truncateAddr('0x742d35Cc6634C0532925a3b844Bc454e4438f44e')}</span>
            </PartyRow>
            <PartyRow label="arbiter">
              <OperatorIdentity
                address="0xab5801a7d398351b8be11c439e05c5b3259aec9b"
                name="Operator Service"
                size="sm"
                hideAddress
              />
              <span className="ds-text-xs ds-subtle">{truncateAddr('0xab5801a7d398351b8be11c439e05c5b3259aec9b')}</span>
              <span className="ds-badge ds-badge--accent">avs</span>
            </PartyRow>
          </div>
        </div>
      </div>

      {/* Metadata block */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">commitment metadata</div>
        <MetadataSummary
          uri="ipfs://bafkreigh2akiscaildc3xwmamkdkzsxwt4kp4kk4f7klqpd4ufnfbazlta"
          contentHash="0x47c8a4b1f3e9d2b5a8c6f0e1d3b7a9f2e8c4d6b1a5f9c3e7b2d4a6f8c1e9b3d5"
          status="ok"
          updatedAt="2026-04-19"
        />
      </div>

      {/* Commitment card · composite */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">commitment card · composite</div>
        <div className="ds-commitment-card">
          <div className="ds-commitment-card-header">
            <span className="ds-row ds-row-3">
              <span className="ds-commitment-card-id">commitment #0042</span>
              <CommitmentStatusBadge status="FORFEIT_PENDING" />
            </span>
            <span className="ds-row ds-row-2">
              <Button variant="ghost" size="sm">Challenge</Button>
              <Button variant="destructive" size="sm">Execute Forfeit</Button>
            </span>
          </div>
          <div className="ds-commitment-card-body">
            <div className="ds-commitment-card-amount-row">
              <TokenAmount
                amount={parseEther('12.4057')}
                decimals={18}
                symbol="ETH"
                size="display"
                withIcon
              />
              <div className="ds-stack ds-stack-1" style={{ alignItems: 'flex-end' }}>
                <span className="ds-label">max penalty</span>
                <RiskRow bps={5000} label="of stake" />
              </div>
            </div>
            <hr className="ds-divider" />
            <div className="ds-party-list">
              <PartyRow label="depositor">
                <OperatorIdentity
                  address="0xC4f7000000000000000000000000000000003Ab9"
                  name="Pellar Labs"
                  size="sm"
                  hideAddress
                />
                <span className="ds-badge ds-badge--solid">YOU</span>
              </PartyRow>
              <PartyRow label="counterparty">
                <OperatorIdentity
                  address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                  name="Pinax"
                  size="sm"
                  hideAddress
                />
              </PartyRow>
              <PartyRow label="arbiter">
                <OperatorIdentity
                  address="0xab5801a7d398351b8be11c439e05c5b3259aec9b"
                  name="Operator Service"
                  size="sm"
                  hideAddress
                />
                <span className="ds-badge ds-badge--accent">avs</span>
              </PartyRow>
              <PartyRow label="yield share">
                <span className="ds-mono-num">{formatPercent(1000)}</span>
                <span className="ds-text-xs ds-subtle">to counterparty</span>
              </PartyRow>
            </div>
            <hr className="ds-divider" />
            <LifecycleStepper steps={commitmentLifecycle('FORFEIT_PENDING')} />
            <Countdown label="forfeit execution delay" elapsed={3600 * 18} total={3600 * 24} tone="warn" />
            <MetadataSummary
              uri="ipfs://bafkreigh2akiscaildc3xwmamkdkzsxwt4kp4kk4f7klqpd4ufnfbazlta"
              contentHash="0x47c8a4b1f3e9d2b5a8c6f0e1d3b7a9f2e8c4d6b1a5f9c3e7b2d4a6f8c1e9b3d5"
              status="ok"
              updatedAt="2026-04-19"
            />
          </div>
          <div className="ds-commitment-card-footer">
            <span>created 2026-04-12 · expires 2026-05-12</span>
            <span>vault yield · price 1.0234 ETH/cETH</span>
          </div>
        </div>
      </div>

      {/* Commitment list row */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">commitment list · table</div>
        <table className="ds-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Counterparty</th>
              <th>Arbiter</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th style={{ textAlign: 'right' }}>Max Penalty</th>
              <th>Status</th>
              <th>Window</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="ds-mono-num ds-muted">#0042</td>
              <td>
                <OperatorIdentity address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e" name="Pinax" size="sm" hideAddress />
              </td>
              <td>
                <OperatorIdentity address="0xab5801a7d398351b8be11c439e05c5b3259aec9b" name="Service" size="sm" hideAddress />
              </td>
              <td style={{ textAlign: 'right' }}>
                <TokenAmount amount={parseEther('12.4057')} decimals={18} symbol="ETH" size="inline" />
              </td>
              <td style={{ textAlign: 'right' }} className="ds-mono-num">{formatPercent(5000)}</td>
              <td><CommitmentStatusBadge status="FORFEIT_PENDING" /></td>
              <td className="ds-text-xs ds-subtle">6h remaining</td>
            </tr>
            <tr>
              <td className="ds-mono-num ds-muted">#0041</td>
              <td>
                <OperatorIdentity address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e" name="Pinax" size="sm" hideAddress />
              </td>
              <td>
                <OperatorIdentity address="0xab5801a7d398351b8be11c439e05c5b3259aec9b" name="Service" size="sm" hideAddress />
              </td>
              <td style={{ textAlign: 'right' }}>
                <TokenAmount amount={parseEther('3.10')} decimals={18} symbol="ETH" size="inline" />
              </td>
              <td style={{ textAlign: 'right' }} className="ds-mono-num">{formatPercent(2500)}</td>
              <td><CommitmentStatusBadge status="ACTIVE" /></td>
              <td className="ds-text-xs ds-subtle">expires in 18d</td>
            </tr>
            <tr>
              <td className="ds-mono-num ds-muted">#0038</td>
              <td>
                <OperatorIdentity address="0xab5801a7d398351b8be11c439e05c5b3259aec9b" size="sm" hideAddress />
              </td>
              <td>
                <OperatorIdentity address="0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97" name="Service" size="sm" hideAddress />
              </td>
              <td style={{ textAlign: 'right' }}>
                <TokenAmount amount={parseEther('0.85')} decimals={18} symbol="ETH" size="inline" />
              </td>
              <td style={{ textAlign: 'right' }} className="ds-mono-num">{formatPercent(10000)}</td>
              <td><CommitmentStatusBadge status="FORFEITED" /></td>
              <td className="ds-text-xs ds-subtle">2d ago</td>
            </tr>
            <tr>
              <td className="ds-mono-num ds-muted">#0027</td>
              <td>
                <OperatorIdentity address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e" name="Pinax" size="sm" hideAddress />
              </td>
              <td>
                <OperatorIdentity address="0xab5801a7d398351b8be11c439e05c5b3259aec9b" name="Service" size="sm" hideAddress />
              </td>
              <td style={{ textAlign: 'right' }}>
                <TokenAmount amount={parseEther('8.00')} decimals={18} symbol="ETH" size="inline" />
              </td>
              <td style={{ textAlign: 'right' }} className="ds-mono-num">{formatPercent(5000)}</td>
              <td><CommitmentStatusBadge status="RELEASED" /></td>
              <td className="ds-text-xs ds-subtle">21d ago</td>
            </tr>
          </tbody>
        </table>
      </div>
      <SourceBlock label="example" source={SRC_COMMITMENTS} />
    </section>
  )
}
