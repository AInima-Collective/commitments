import { useEffect, useState } from 'react'
import { useChainId } from 'wagmi'
import { Card, Notice } from '../components/ui'
import { ActorSwitcher, PageHeader, TimeControls } from '../components/protocol'
import { DevWalletProvider } from '../contexts/DevWalletProvider'
import {
  OperatorsTab,
  ScenariosTab,
  RiskTab,
  VaultTab,
  YieldTab,
} from '../components/admin'
import { ensureAutomine } from '../hooks/useAnvilTime'

const ANVIL_CHAIN_ID = 31337

type Tab =
  | 'scenarios'
  | 'vault'
  | 'risk'
  | 'yield'
  | 'operators'
  | 'time'

const TABS: { id: Tab; label: string }[] = [
  { id: 'scenarios', label: 'scenarios' },
  { id: 'vault', label: 'vault' },
  { id: 'risk', label: 'risk' },
  { id: 'yield', label: 'yield' },
  { id: 'operators', label: 'operators' },
  { id: 'time', label: 'time' },
]

export default function Admin() {
  const chainId = useChainId()

  if (chainId !== ANVIL_CHAIN_ID) {
    return (
      <div className="ds-page">
        <PageHeader
          eyebrow="dev"
          title="Admin"
          lead="Local-only protocol testing surface. Connect to a local Anvil node (chain 31337) to use it."
        />
        <Notice tone="warn" title="Admin requires local Anvil">
          The admin page exposes anvil-only controls (preset accounts, time warps, direct
          writes against deployed contracts). It is intentionally disabled on every other
          network.
        </Notice>
      </div>
    )
  }

  return (
    <DevWalletProvider>
      <AdminContent />
    </DevWalletProvider>
  )
}

function AdminContent() {
  const [activeTab, setActiveTab] = useState<Tab>('scenarios')
  const [autoMineState, setAutoMineState] = useState<'unknown' | 'enabled' | 'failed'>('unknown')

  // Force anvil's automine on while admin is open. dev-up sets interval mining
  // at 2s, which sometimes drifts (e.g., after a manual restart) and leaves
  // submitted txs stuck in the mempool until viem's wait timeout. With
  // automine on, every writeContract call mines a block immediately.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await ensureAutomine()
        if (!cancelled) setAutoMineState('enabled')
      } catch {
        if (!cancelled) setAutoMineState('failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="ds-page">
      <PageHeader
        eyebrow="dev"
        title="Admin"
        lead="Drive the protocol end-to-end on local Anvil — switch actors, warp time, exercise every write."
        actions={<ActorSwitcher size="sm" />}
      />

      <Notice
        tone={autoMineState === 'failed' ? 'danger' : 'info'}
        title="Local dev tooling"
      >
        Connected to Anvil ({ANVIL_CHAIN_ID}). All transactions are signed locally with
        anvil-mnemonic keys; no MetaMask popup. Automine:{' '}
        <strong>
          {autoMineState === 'enabled'
            ? 'on (every tx mines its own block)'
            : autoMineState === 'failed'
            ? 'failed to enable — is anvil running on :8545?'
            : 'enabling…'}
        </strong>
      </Notice>

      <div className="ds-tabs" role="tablist" aria-label="Admin sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className="ds-tab"
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="ds-stack ds-stack-4" role="tabpanel">
        {activeTab === 'scenarios' && <ScenariosTab />}
        {activeTab === 'vault' && <VaultTab />}
        {activeTab === 'risk' && <RiskTab />}
        {activeTab === 'yield' && <YieldTab />}
        {activeTab === 'operators' && <OperatorsTab />}
        {activeTab === 'time' && (
          <Card as="section" density="compact" aria-label="Time controls" className="ds-stack ds-stack-3">
            <TimeControls />
          </Card>
        )}
      </section>
    </div>
  )
}
