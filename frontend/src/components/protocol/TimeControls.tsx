import { useState } from 'react'
import { Button, Input, Notice } from '../ui'
import { TIME_PRESETS, useAnvilTime, type UseAnvilTimeResult } from '../../hooks/useAnvilTime'

export interface TimeControlsProps {
  /**
   * Optional override of the time controller. Defaults to `useAnvilTime()`.
   * Allow injection so /design demos can show the UI without actually
   * touching a chain.
   */
  controller?: UseAnvilTimeResult
  /** Visual density. */
  size?: 'sm' | 'md'
}

function formatTimestamp(ts: bigint | undefined): string {
  if (ts === undefined) return '—'
  const ms = Number(ts) * 1000
  return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
}

/**
 * Anvil-only time controls — preset buttons for the canonical protocol
 * windows (1d / 14d / 90d), free-form advance/mine inputs, plus a readout
 * of the current chain timestamp + block number.
 *
 * Mounts no logic of its own beyond the wrapper around {@link useAnvilTime};
 * the hook is the source of truth.
 */
export function TimeControls({ controller, size = 'md' }: TimeControlsProps) {
  const live = useAnvilTime()
  const ctl = controller ?? live

  const [advanceSeconds, setAdvanceSeconds] = useState('3600')
  const [warpUnix, setWarpUnix] = useState('')
  const [mineBlocks, setMineBlocks] = useState('5')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="ds-stack ds-stack-3" data-time-controls data-size={size}>
      <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap', alignItems: 'baseline' }}>
        <span className="ds-text-xs ds-subtle">block</span>
        <span className="ds-mono-num">
          {ctl.blockNumber !== undefined ? `#${ctl.blockNumber.toString()}` : '…'}
        </span>
        <span className="ds-text-xs ds-subtle">·</span>
        <span className="ds-mono-num">{formatTimestamp(ctl.now)}</span>
      </div>

      <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {TIME_PRESETS.map((p) => (
          <Button
            key={p.id}
            size={size === 'sm' ? 'sm' : 'md'}
            disabled={!!busy}
            onClick={() => run(p.id, () => ctl.advance(p.seconds))}
            title={p.hint}
          >
            {busy === p.id ? '…' : p.label}
          </Button>
        ))}
        <Button
          size={size === 'sm' ? 'sm' : 'md'}
          disabled={!!busy}
          onClick={() => run('mine-1', () => ctl.mine(1))}
          title="mine 1 empty block"
        >
          {busy === 'mine-1' ? '…' : 'Mine 1'}
        </Button>
      </div>

      <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <Input
          size={size === 'sm' ? 'sm' : 'md'}
          type="number"
          min={1}
          inputMode="numeric"
          value={advanceSeconds}
          onChange={(e) => setAdvanceSeconds(e.target.value)}
          aria-label="advance seconds"
          suffix="s"
          style={{ maxWidth: 140 }}
        />
        <Button
          size={size === 'sm' ? 'sm' : 'md'}
          disabled={!!busy || !Number(advanceSeconds)}
          onClick={() =>
            run('advance', () => ctl.advance(Math.floor(Number(advanceSeconds))))
          }
        >
          {busy === 'advance' ? '…' : 'Advance'}
        </Button>

        <Input
          size={size === 'sm' ? 'sm' : 'md'}
          type="number"
          min={1}
          inputMode="numeric"
          value={mineBlocks}
          onChange={(e) => setMineBlocks(e.target.value)}
          aria-label="mine blocks"
          suffix="blk"
          style={{ maxWidth: 120 }}
        />
        <Button
          size={size === 'sm' ? 'sm' : 'md'}
          disabled={!!busy || !Number(mineBlocks)}
          onClick={() => run('mine-n', () => ctl.mine(Math.floor(Number(mineBlocks))))}
        >
          {busy === 'mine-n' ? '…' : 'Mine N'}
        </Button>

        <Input
          size={size === 'sm' ? 'sm' : 'md'}
          type="number"
          min={1}
          inputMode="numeric"
          value={warpUnix}
          placeholder="unix ts"
          onChange={(e) => setWarpUnix(e.target.value)}
          aria-label="warp to unix timestamp"
          style={{ maxWidth: 180 }}
        />
        <Button
          size={size === 'sm' ? 'sm' : 'md'}
          disabled={!!busy || !Number(warpUnix)}
          onClick={() => run('warp', () => ctl.warpTo(Math.floor(Number(warpUnix))))}
        >
          {busy === 'warp' ? '…' : 'Warp to'}
        </Button>
      </div>

      {error && (
        <Notice tone="danger" size="sm" title="Anvil RPC error">
          {error}
        </Notice>
      )}
    </div>
  )
}
