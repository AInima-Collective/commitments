import { type Address } from 'viem'

import { EmptyState, TokenAmount } from '../ui'
import { OperatorIdentity } from '../protocol'

export interface RosterMember {
  commitmentId: bigint
  committer: Address
  /** Value credited at join (== forfeitableUnits in homogeneous mode). */
  creditedValue: bigint
  /** Units already settled to the beneficiary. */
  settledUnits: bigint
  /** Live owed markdown (from pendingMemberLoss). */
  owedUnits: bigint
  /** Optional display name resolved from the operator registry. */
  name?: string
}

interface MutualRosterProps {
  members: RosterMember[]
  decimals: number
  symbol: string
  /** Highlight this committer's row as "you". */
  viewAddress?: Address
}

/**
 * MutualRoster — table of mutual members showing credited value, settled
 * units, and live owed markdown. Feature-shaped composition of the table
 * primitives + OperatorIdentity.
 */
export function MutualRoster({ members, decimals, symbol, viewAddress }: MutualRosterProps) {
  if (members.length === 0) {
    return <EmptyState title="NO MEMBERS" description="No one has joined this mutual yet." />
  }
  const you = viewAddress?.toLowerCase()
  return (
    <table className="ds-table">
      <thead>
        <tr>
          <th>commitment</th>
          <th>member</th>
          <th style={{ textAlign: 'right' }}>credited</th>
          <th style={{ textAlign: 'right' }}>settled</th>
          <th style={{ textAlign: 'right' }}>owed</th>
        </tr>
      </thead>
      <tbody>
        {members.map((m) => (
          <tr key={m.commitmentId.toString()}>
            <td className="ds-mono-num ds-muted">#{m.commitmentId.toString()}</td>
            <td>
              <span className="ds-row ds-row-2">
                <OperatorIdentity address={m.committer} name={m.name} size="sm" hideAddress />
                {you && m.committer.toLowerCase() === you && (
                  <span className="ds-badge ds-badge--solid">YOU</span>
                )}
              </span>
            </td>
            <td style={{ textAlign: 'right' }}>
              <TokenAmount amount={m.creditedValue} decimals={decimals} symbol={symbol} size="inline" />
            </td>
            <td style={{ textAlign: 'right' }}>
              <TokenAmount amount={m.settledUnits} decimals={decimals} symbol={symbol} size="inline" />
            </td>
            <td style={{ textAlign: 'right' }}>
              <TokenAmount amount={m.owedUnits} decimals={decimals} symbol={symbol} size="inline" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
