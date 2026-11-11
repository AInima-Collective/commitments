import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { VaultPosition } from '../../../hooks/useVaultPosition'
import type { VaultRiskMetrics } from '../../../hooks/useVaultRiskMetrics'
import { PositionPanel } from '../PositionPanel'

const position = (over: Partial<VaultPosition>): VaultPosition => ({
  shares: 0n,
  free: 0n,
  encumbered: 0n,
  held: 0n,
  underlyingValue: 0n,
  assetAddress: undefined,
  assetSymbol: 'USDC',
  assetName: 'USD Coin',
  assetDecimals: 6,
  shareDecimals: 18,
  depositsPaused: false,
  isLoading: false,
  refetch: () => {},
  ...over,
})

const riskMetrics: VaultRiskMetrics = { activeCount: 2, maxPenaltyBps: 1000, oldestSec: 0, tier: 'unknown' }

describe('PositionPanel', () => {
  it('splits everything held: wallet and manager-free shares are free, the rest encumbered', () => {
    render(
      <PositionPanel
        position={position({ shares: 100n * 10n ** 18n, free: 300n * 10n ** 18n, encumbered: 600n * 10n ** 18n, held: 1000n * 10n ** 18n })}
        isConnected
        riskMetrics={riskMetrics}
      />,
    )
    const meter = screen.getByRole('meter')
    expect(meter.parentElement!.textContent).toMatch(/FREE: 40\.00% · ENCUMBERED: 60\.00%/)
  })
})
