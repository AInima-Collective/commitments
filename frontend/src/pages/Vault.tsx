import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { type Address, isAddress } from 'viem'
import { useAccount, useChainId } from 'wagmi'
import {
  AddressDisplay,
  Button,
  ChainBadge,
  EmptyState,
  Modal,
  Notice,
  Tabs,
  TokenAmount,
  TokenIcon,
  VaultHeader,
  type VaultHeaderStat,
} from '../components/ui'
import {
  CuratorCard,
  StrategyCard,
  type VaultCurator,
  type VaultStrategy,
} from '../components/protocol'
import { commitmentDetailPath } from '../lib/arbitrationRoutes'
import { getBlockExplorer } from '../lib/blockExplorer'
import { CommitmentsTable } from '../components/commitment/CommitmentsTable'
import { DepositWizard } from '../components/vault/DepositWizard'
import { PositionPanel } from '../components/vault/PositionPanel'
import { WithdrawForm } from '../components/vault/WithdrawForm'
import { ForfeitLedgerTab } from '../components/vault/ForfeitLedgerTab'
import { VaultActivity } from '../components/vault/VaultActivity'
import { VaultCoverageCard } from '../components/vault/VaultCoverageCard'
import { VaultApyChart } from '../components/vault/VaultApyChart'
import { VaultStrategyRisk } from '../components/vault/VaultStrategyRisk'
import { VaultTvlChart } from '../components/vault/VaultTvlChart'
import { getContractAddresses, getVaultDescription } from '../config/contracts'
import { useAssetPrices } from '../hooks/useAssetPrices'
import { useForfeitLedger } from '../hooks/useForfeitLedger'
import { useVaultActivity } from '../hooks/useVaultActivity'
import { useVaultApy } from '../hooks/useVaultApy'
import { useVaultMetadata } from '../hooks/useIndexerMetadata'
import { useTokenMetaMap } from '../hooks/useTokenMeta'
import { useUnifiedRows, type UnifiedRow } from '../hooks/useUnifiedRows'
import { useVaultPeriodicHistory } from '../hooks/useVaultPeriodicHistory'
import { useVaultPosition } from '../hooks/useVaultPosition'
import { useVaultRiskMetrics } from '../hooks/useVaultRiskMetrics'
import { useVaults } from '../hooks/useVaults'
import { useVaultStats } from '../hooks/useVaultStats'
import { useViewAddress } from '../hooks/useViewAddress'
import { bigintToUsd, formatPercent } from '../lib/format'
import { asString, asStringArray } from '../lib/metadata'

type VaultTab = 'overview' | 'commitments' | 'activity' | 'ledger'

function readCurator(content: Record<string, unknown> | null): VaultCurator | null {
  const raw = content && typeof content.curator === 'object' ? (content.curator as Record<string, unknown>) : null
  if (!raw) return null
  const name = asString(raw.name)
  if (!name) return null
  return {
    name,
    description: asString(raw.description),
    logoURI: asString(raw.logoURI),
    website: asString(raw.website),
    twitter: asString(raw.twitter),
  }
}

function readStrategy(content: Record<string, unknown> | null): VaultStrategy | null {
  const raw = content && typeof content.strategy === 'object' ? (content.strategy as Record<string, unknown>) : null
  if (!raw) return null
  const name = asString(raw.name)
  const summary = asString(raw.summary)
  if (!name || !summary) return null
  return {
    name,
    summary,
    riskTier: asString(raw.riskTier),
    venues: asStringArray(raw.venues),
    documentationURI: asString(raw.documentationURI),
  }
}

export default function Vault() {
  const chainId = useChainId()
  const viewAddress = useViewAddress()
  const { address: connectedAddress, isConnected } = useAccount()
  const params = useParams<{ address: string }>()
  // Vault address comes from the URL — falls back to the env-configured
  // canonical vault when no address is in the path (legacy /vault entry).
  const urlAddress = params.address && isAddress(params.address) ? (params.address as Address) : undefined
  const env = getContractAddresses(chainId)
  const vaultAddress = urlAddress ?? env.commitmentsVault
  const descriptor = useVaults().vaultFor(vaultAddress)
  const { commitmentManager: managerAddress } = env

  const position = useVaultPosition({ vaultAddress, viewAddress, managerAddress })
  const stats = useVaultStats(vaultAddress)
  const priceSymbols = position.assetSymbol ? [position.assetSymbol] : []
  const { getPrice } = useAssetPrices({ symbols: priceSymbols })
  const activity = useVaultActivity({ vaultAddress, userAddress: viewAddress })
  const apy = useVaultApy(vaultAddress)
  // The commitments tab shares the same table component as the Dashboard and
  // Commitment surfaces use indexer-backed unified rows. This view is scoped to THIS vault:
  // a commitment's backing `token` is the vault-share address (cvUSDC/cvWETH),
  // which equals this page's vault address, so filter the viewer's commitment
  // rows down to those backed by this vault. Without it every vault page renders
  // the same unscoped list and the USDC + WETH vaults are indistinguishable.
  const { rows: unifiedRows, isLoading: commitmentsLoading, refetch: refetchCommitments } = useUnifiedRows({
    managerAddress,
    viewAddress,
  })
  const vaultCommitmentRows = useMemo(
    () =>
      unifiedRows.filter(
        (r) => r.kind === 'commitment' && r.token.toLowerCase() === vaultAddress?.toLowerCase(),
      ),
    [unifiedRows, vaultAddress],
  )
  const riskMetrics = useVaultRiskMetrics(vaultCommitmentRows)
  const vaultCommitmentTokenMeta = useTokenMetaMap(vaultCommitmentRows.map((r) => r.token))
  const navigate = useNavigate()
  // Every row here is a commitment (proposals are filtered out above), so the
  // click handler always deep-links to the shareable per-commitment detail page.
  const openCommitmentRow = (row: UnifiedRow) => navigate(commitmentDetailPath(row.id))
  const ledger = useForfeitLedger({ vaultAddress })
  const vaultMetadata = useVaultMetadata(vaultAddress)
  const curator = readCurator(vaultMetadata.content)
  const strategy = readStrategy(vaultMetadata.content)
  // Drives the overview tab's snapshot-dependent sections (TVL chart, APY
  // chart). When the indexer hasn't recorded a snapshot yet
  // — fresh anvil, indexer just started — we hide those entirely instead of
  // surfacing empty/zero charts. React Query dedupes the cache so the
  // children's own `useVaultPeriodicHistory` calls reuse this fetch.
  const periodicHistory = useVaultPeriodicHistory({ vaultAddress, days: 30 })
  // Hide only when we know the indexer returned zero rows. While the query
  // is loading or errored, leave the section in place so the children can
  // surface their own loading / error state.
  const hasSnapshots =
    periodicHistory.data === undefined
      ? true
      : periodicHistory.data.rows.length > 0

  const [depositOpen, setDepositOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<VaultTab>('overview')

  function handleDepositSuccess() {
    setDepositOpen(false)
    position.refetch()
    void activity.refetch()
  }

  function handleWithdrawSuccess() {
    setWithdrawOpen(false)
    position.refetch()
    void activity.refetch()
  }

  if (!vaultAddress) {
    return (
      <div className="ds-page">
        <Notice tone="warn" title="Vault not configured">
          Set <code>VITE_COMMITMENTS_VAULT_ADDRESS</code> in your environment to enable the vault.
        </Notice>
      </div>
    )
  }

  const symbol = position.assetSymbol ?? descriptor?.assetSymbol ?? 'TOKEN'
  const aDecimals = position.assetDecimals ?? descriptor?.assetDecimals ?? 18
  const isPaused = position.depositsPaused

  const metaName = asString(vaultMetadata.content?.name)
  const metaDescription = asString(vaultMetadata.content?.description)
  const heroName = metaName ?? descriptor?.name ?? `${symbol} Vault`
  const description =
    metaDescription ??
    getVaultDescription(vaultAddress) ??
    'Yield-bearing ERC-4626 vault. Shares stay liquid in your wallet; deposit them into the manager to back commitments. Vault exits are instant.'

  // Pause state is signaled by the deposit/withdraw badges + the Notice
  // beneath the hero + the disabled action buttons. Tinting the entire
  // header on top of that triple-signal was overkill — the header stays
  // accent regardless of pause state.
  const headerAccent = 'accent' as const

  const headerStats: VaultHeaderStat[] = [
    {
      label: 'TVL',
      value:
        stats.totalAssets !== undefined ? (
          <TokenAmount
            amount={stats.totalAssets}
            decimals={aDecimals}
            symbol={symbol}
            compact
            size="inline"
          />
        ) : (
          <span className="ds-subtle">—</span>
        ),
      meta: stats.isLoading ? 'loading' : 'underlying',
    },
    {
      label: 'Net APY',
      value:
        apy.netBps === null ? (
          <span className="ds-row ds-row-2" style={{ display: 'inline-flex' }}>
            <span className="ds-subtle">—</span>
            <span
              className="ds-badge ds-badge--muted"
              title={apy.footnote}
              aria-label={apy.footnote}
            >
              accruing
            </span>
          </span>
        ) : (
          formatPercent(apy.netBps)
        ),
      meta:
        apy.secondaryBps !== null
          ? `${apy.secondaryLabel} ${formatPercent(apy.secondaryBps)}`
          : undefined,
      // Only paint a realized, positive rate 'success'. While the APY is still
      // accruing (netBps === null) the stat stays neutral — we never dress up
      // an absent rate as a return.
      tone: apy.netBps !== null && apy.netBps > 0 ? 'success' : 'neutral',
      emphasis: true,
    },
  ]

  const pauseTitle = 'Deposits paused'
  const pauseBody =
    'New deposits are blocked. Existing positions and instant withdrawals are unaffected. Check back once deposits reopen.'

  return (
    <div className="ds-page">
      <nav aria-label="Breadcrumb" className="ds-breadcrumbs">
        <Link to="/app/vaults" className="ds-breadcrumb">← All vaults</Link>
      </nav>

      <VaultHeader
        accent={headerAccent}
        icon={<TokenIcon symbol={symbol} size="xl" />}
        eyebrow="VAULT"
        title={heroName}
        subtitle={description}
        meta={
          <>
            <ChainBadge chainId={chainId} />
            <span aria-hidden="true">·</span>
            <span className="ds-row ds-row-1">
              <span className="ds-subtle">Vault</span>
              <AddressDisplay
                address={vaultAddress}
                explorerUrl={
                  getBlockExplorer(chainId)
                    ? `${getBlockExplorer(chainId)}/address/${vaultAddress}`
                    : undefined
                }
              />
            </span>
            {position.assetAddress && (
              <>
                <span aria-hidden="true">·</span>
                <span className="ds-row ds-row-1">
                  <span className="ds-subtle">Asset</span>
                  <AddressDisplay
                    address={position.assetAddress}
                    explorerUrl={
                      getBlockExplorer(chainId)
                        ? `${getBlockExplorer(chainId)}/address/${position.assetAddress}`
                        : undefined
                    }
                  />
                </span>
              </>
            )}
          </>
        }
        badges={
          <>
            {position.depositsPaused && (
              <span className="ds-badge ds-badge--warn">deposits paused</span>
            )}
            {!isPaused && <span className="ds-badge ds-badge--success">open</span>}
          </>
        }
        actions={
          <>
            <Button
              variant="primary"
              onClick={() => setDepositOpen(true)}
              disabled={position.depositsPaused}
              aria-disabled={position.depositsPaused}
              aria-describedby={
                position.depositsPaused ? 'vault-deposit-disabled-reason' : undefined
              }
              title={position.depositsPaused ? 'Deposits paused' : undefined}
            >
              Deposit
            </Button>
            {position.depositsPaused && (
              <span id="vault-deposit-disabled-reason" className="ds-sr-only">
                Deposits are paused. Existing positions, withdrawals, and claims are unaffected.
              </span>
            )}
            <Button
              onClick={() => setWithdrawOpen(true)}
              disabled={(position.shares ?? 0n) === 0n}
              aria-disabled={(position.shares ?? 0n) === 0n}
              aria-describedby={
                (position.shares ?? 0n) === 0n ? 'vault-withdraw-disabled-reason-empty' : undefined
              }
              title={(position.shares ?? 0n) === 0n ? 'No shares to withdraw' : undefined}
            >
              Withdraw
            </Button>
            {(position.shares ?? 0n) === 0n && (
              <span id="vault-withdraw-disabled-reason-empty" className="ds-sr-only">
                You have no shares to withdraw. Deposit first.
              </span>
            )}
          </>
        }
        stats={headerStats}
      />

      {isPaused && (
        <Notice tone="warn" title={pauseTitle}>
          {pauseBody}
        </Notice>
      )}

      {/* Underwritten vaults: "automatically covered" banner + coverage market
       *  stats (capacity, premium stream, skim cost, underwriter APR). Derived
       *  from the indexer (mutual.coveredVault == this vault) — renders nothing
       *  for ordinary vaults. */}
      <VaultCoverageCard
        vaultAddress={vaultAddress}
        assetDecimals={position.assetDecimals}
        assetSymbol={position.assetSymbol}
      />

      {/* Public vault analytics (TVL/APY/ledger) render for everyone; only the
       *  position-scoped panel and tabs need a selected address. Prompt for one
       *  without gating the whole page behind it. */}
      {!viewAddress && (
        <Notice tone="info" title="No address selected">
          Connect a wallet or paste an Ethereum address above to deposit and view
          your position. Public vault analytics are shown below.
        </Notice>
      )}

      {/* Only surface the position panel for users who already hold shares
       *  in this vault. A cold-start depositor sees the hero + tabs first;
       *  the position recap reveals once they have something to recap. */}
      {(position.shares ?? 0n) > 0n && (
        <PositionPanel
          position={position}
          isConnected={isConnected}
          riskMetrics={riskMetrics}
          underlyingUsd={(() => {
            const price = getPrice(position.assetSymbol)
            if (!price) return undefined
            if (position.underlyingValue === undefined) return undefined
            return bigintToUsd(position.underlyingValue, aDecimals, price.usd)
          })()}
        />
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as VaultTab)}>
        <Tabs.List aria-label="Vault views">
          <Tabs.Trigger value="overview">overview</Tabs.Trigger>
          <Tabs.Trigger value="commitments" count={vaultCommitmentRows.length}>
            commitments
          </Tabs.Trigger>
          <Tabs.Trigger value="activity">activity</Tabs.Trigger>
          <Tabs.Trigger value="ledger" count={ledger.data?.counts.forfeit ?? 0}>
            ledger
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Panel value="overview" className="ds-stack ds-stack-8" aria-label="Overview">
          {(curator || strategy) && (
            <div className="ds-grid-auto-fit">
              {curator && <CuratorCard curator={curator} />}
              {strategy && <StrategyCard strategy={strategy} />}
            </div>
          )}
          {hasSnapshots && (
            <div className="ds-grid-auto-fit">
              <div className="ds-stack ds-stack-2">
                <header className="ds-section-header">
                  <h3 className="ds-section-title">TVL</h3>
                  <span className="ds-section-eyebrow">last 30 days</span>
                </header>
                <VaultTvlChart
                  vaultAddress={vaultAddress}
                  assetDecimals={position.assetDecimals}
                  assetSymbol={position.assetSymbol}
                />
              </div>
              <div className="ds-stack ds-stack-2">
                <header className="ds-section-header">
                  <h3 className="ds-section-title">APY</h3>
                  <span className="ds-section-eyebrow">7d / 30d rolling</span>
                </header>
                <VaultApyChart vaultAddress={vaultAddress} />
              </div>
            </div>
          )}
          <VaultStrategyRisk
            vaultAddress={vaultAddress}
            managerAddress={managerAddress}
            registryAddress={env.operatorRegistry}
            meshFactoryAddress={env.meshFactory}
          />
        </Tabs.Panel>

        <Tabs.Panel value="commitments" className="ds-stack ds-stack-3" aria-label="Commitments">
          <header className="ds-section-header">
            <div className="ds-stack ds-stack-1">
              <h2 className="ds-section-title">Commitments</h2>
              <span className="ds-section-eyebrow">
                shares locked by your active commitments — release a commitment to unlock
              </span>
            </div>
            <Link to="/app/explorer" className="ds-text-sm">
              explore all commitments →
            </Link>
          </header>
          <CommitmentsTable
            aria-label="Vault commitments"
            rows={vaultCommitmentRows}
            onOpenRow={openCommitmentRow}
            tokenMeta={vaultCommitmentTokenMeta}
            resolveContext={
              managerAddress
                ? { managerAddress, connectedAddress, isConnected, onActed: refetchCommitments }
                : undefined
            }
            isLoading={commitmentsLoading && vaultCommitmentRows.length === 0}
            emptyState={
              <EmptyState
                title="NO COMMITMENTS"
                description="No commitments are backed by this vault yet. Create one to lock vault shares as enforceable collateral."
              />
            }
          />
        </Tabs.Panel>

        <Tabs.Panel value="activity" className="ds-stack ds-stack-3" aria-label="Activity">
          <header className="ds-section-header">
            <h2 className="ds-section-title">Activity</h2>
            <span className="ds-section-eyebrow">your transactions in this vault</span>
          </header>
          <VaultActivity
            entries={activity.data}
            isLoading={activity.isLoading}
            assetDecimals={position.assetDecimals ?? descriptor?.assetDecimals}
            assetSymbol={position.assetSymbol ?? descriptor?.assetSymbol}
          />
        </Tabs.Panel>

        <Tabs.Panel value="ledger" className="ds-stack ds-stack-3" aria-label="Ledger">
          <header className="ds-section-header">
            <h2 className="ds-section-title">Ledger</h2>
            <span className="ds-section-eyebrow">
              forfeit, settlement, contribution, and donation events on your shares
            </span>
          </header>
          <ForfeitLedgerTab
            ledger={ledger.data}
            isLoading={ledger.isLoading}
            error={ledger.error}
            assetDecimals={position.assetDecimals ?? descriptor?.assetDecimals}
            assetSymbol={position.assetSymbol ?? descriptor?.assetSymbol}
            shareDecimals={position.shareDecimals}
          />
        </Tabs.Panel>
      </Tabs>

      <Modal
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        title="Deposit"
        description={`Deposit ${symbol} into the vault to start earning yield. Shares stay liquid until you commit them.`}
        size="md"
      >
        <DepositWizard
          vaultAddress={vaultAddress}
          assetAddress={position.assetAddress}
          assetSymbol={position.assetSymbol}
          assetDecimals={position.assetDecimals}
          userAddress={connectedAddress}
          isConnected={isConnected}
          depositsPaused={position.depositsPaused}
          onDepositSuccess={handleDepositSuccess}
        />
      </Modal>

      <Modal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        title="Withdraw"
        description="Redeem vault shares for the underlying asset. Exits are instant — no unbonding queue."
        size="md"
      >
        <WithdrawForm
          vaultAddress={vaultAddress}
          userAddress={connectedAddress}
          shares={position.shares}
          shareDecimals={position.shareDecimals}
          assetDecimals={position.assetDecimals}
          assetSymbol={position.assetSymbol}
          isConnected={isConnected}
          onWithdrawSuccess={handleWithdrawSuccess}
        />
      </Modal>
    </div>
  )
}
