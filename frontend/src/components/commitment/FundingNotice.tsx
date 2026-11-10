import { Notice, TokenAmount } from '../ui'

interface FundingNoticeProps {
  /** The amount the commitment locks. */
  amount: bigint | undefined
  /** Free balance in the manager ledger. */
  free: bigint | undefined
  /** The part of `amount` the free balance does not cover. */
  shortfall: bigint
  wallet: bigint | undefined
  decimals: number
  symbol?: string
  /** What the free balance is called: "backing" or "shares". */
  noun: string
  /** What is being created: "commitment" or "delegation". */
  subject: string
}

/**
 * The "funded from wallet" / "not enough" notice for a create that pulls its
 * shortfall from the wallet through `createAndFund`. Renders nothing when the
 * free balance covers the amount.
 */
export function FundingNotice({ amount, free, shortfall, wallet, decimals, symbol, noun, subject }: FundingNoticeProps) {
  if (shortfall <= 0n) return null
  const token = (value: bigint | undefined) => (
    <TokenAmount amount={value ?? 0n} decimals={decimals} symbol={symbol} size="inline" />
  )
  if (wallet !== undefined && shortfall > wallet) {
    return (
      <Notice tone="warn" size="sm" title={`NOT ENOUGH ${noun.toUpperCase()}`}>
        This {subject} locks {token(amount)}, but you have only {token(free)} free plus {token(wallet)} in your
        wallet.{symbol ? ` Add more ${symbol} to continue.` : ''}
      </Notice>
    )
  }
  return (
    <Notice tone="info" size="sm" title="WILL FUND FROM WALLET">
      Free {noun} covers {token(free)} — the remaining {token(shortfall)} is deposited from your wallet in the same
      transaction.
    </Notice>
  )
}
