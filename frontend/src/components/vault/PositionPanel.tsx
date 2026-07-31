import { TokenAmount, UsdAmount } from '../ui'
import { EncumbranceBar } from '../protocol'
import type { VaultPosition } from '../../hooks/useVaultPosition'
import type { VaultRiskMetrics } from '../../hooks/useVaultRiskMetrics'

export interface PositionPanelProps {
  position: VaultPosition
  isConnected: boolean
  /** Aggregate risk metrics over the viewer's active + forfeit-pending commitments. */
  riskMetrics: VaultRiskMetrics
  /** USD-denominated value (6dp, USDC-shape) of `position.underlyingValue`.
   *  `null` renders the explicit "PRICE UNAVAILABLE" path; `undefined` hides
   *  the USD line entirely. */
  underlyingUsd?: bigint | null
}

/**
 * The page's "your position" surface. Carries the user's underlying value at
 * display size, the share ↔ asset ratio, and the canonical free / encumbered
 * share breakdown rendered by the protocol-layer `EncumbranceBar`. The
 * encumbered detail line surfaces the active-commitment count so the user
 * sees what's doing the locking without leaving the panel.
 *
 * Three render states:
 *   - holding: display value + share ratio + encumbrance breakdown
 *   - empty:   zero state with a "deposit to start" message
 *   - loading: keeps the skeleton in place so the layout never shifts
 *
 * Deposit / withdraw CTAs live in the page-level `<VaultHeader>` so the
 * panel stays focused on the position read-out. The full commitments
 * breakdown lives on the `commitments` tab.
 */
export function PositionPanel({
  position,
  isConnected,
  riskMetrics,
  underlyingUsd,
}: PositionPanelProps) {
  const {
    shares,
    encumbered,
    free,
    underlyingValue,
    assetSymbol,
    assetDecimals,
    shareDecimals,
    isLoading,
  } = position

  const symbol = assetSymbol ?? 'TOKEN'
  const aDecimals = assetDecimals ?? 18
  const sDecimals = shareDecimals ?? 18
  const totalShares = shares ?? 0n
  const freeShares = free ?? 0n
  const encumberedShares =
    encumbered ?? (totalShares > freeShares ? totalShares - freeShares : 0n)
  const hasPosition = totalShares > 0n
  const showUsd = underlyingUsd !== undefined

  const activeCount = riskMetrics.activeCount
  const encumberedDetail =
    activeCount > 0
      ? `locked by ${activeCount} active commitment${activeCount === 1 ? '' : 's'} — release to free`
      : 'locked by active commitments — release to free'

  return (
    <section className="ds-position-panel" aria-label="Your vault position">
      <div className="ds-position-panel-body">
        <header className="ds-position-panel-head">
          <div className="ds-position-panel-headline">
            <span className="ds-position-panel-eyebrow">your position</span>
            <div className="ds-position-panel-value">
              {underlyingValue !== undefined ? (
                <TokenAmount
                  amount={underlyingValue}
                  decimals={aDecimals}
                  symbol={symbol}
                  size="display"
                />
              ) : isLoading ? (
                <span className="ds-position-panel-placeholder">…</span>
              ) : (
                <TokenAmount
                  amount={0n}
                  decimals={aDecimals}
                  symbol={symbol}
                  size="display"
                />
              )}
              {showUsd && hasPosition && (
                <span className="ds-position-panel-usd" aria-label="USD value">
                  ≈ <UsdAmount amount={underlyingUsd ?? null} size="default" />
                </span>
              )}
            </div>
            {hasPosition && (
              <span className="ds-position-panel-shares">
                <TokenAmount
                  amount={totalShares}
                  decimals={sDecimals}
                  symbol="shares"
                  size="inline"
                />
              </span>
            )}
            {!hasPosition && !isLoading && (
              <span className="ds-position-panel-empty-msg">
                Deposit {symbol} to start earning yield. Shares stay liquid until you commit them
                to an agreement.
              </span>
            )}
          </div>
        </header>

        {hasPosition && (
          <div className="ds-position-panel-breakdown">
            <EncumbranceBar
              encumbered={encumberedShares}
              total={totalShares}
            />
            <dl className="ds-position-panel-split">
              <div className="ds-position-panel-split-cell">
                <dt className="ds-position-panel-split-label">free</dt>
                <dd className="ds-position-panel-split-value">
                  <TokenAmount
                    amount={freeShares}
                    decimals={sDecimals}
                    symbol="shares"
                    size="inline"
                  />
                </dd>
                <dd className="ds-position-panel-split-detail">
                  available to withdraw or commit
                </dd>
              </div>
              <div className="ds-position-panel-split-cell">
                <dt className="ds-position-panel-split-label">encumbered</dt>
                <dd className="ds-position-panel-split-value" data-tone="warn">
                  <TokenAmount
                    amount={encumberedShares}
                    decimals={sDecimals}
                    symbol="shares"
                    size="inline"
                  />
                </dd>
                <dd className="ds-position-panel-split-detail">
                  {encumberedDetail}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {!isConnected && (
          <p className="ds-position-panel-foot">
            Connect a wallet to deposit or withdraw.
          </p>
        )}
      </div>
    </section>
  )
}
