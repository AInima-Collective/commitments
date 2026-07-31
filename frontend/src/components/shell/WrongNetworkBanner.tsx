import { useAccount, useSwitchChain } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { EXPECTED_CHAIN_ID } from '../../config/wagmi'

const CHAIN_NAMES: Record<number, string> = {
  [mainnet.id]: 'Ethereum Mainnet',
  [sepolia.id]: 'Sepolia',
}

function getChainName(chainId: number | undefined): string {
  if (!chainId) return 'Unknown Network'
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`
}

export function WrongNetworkBanner() {
  const { isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  if (!isConnected || chainId === EXPECTED_CHAIN_ID) {
    return null
  }

  const currentChainName = getChainName(chainId)
  const expectedChainName = getChainName(EXPECTED_CHAIN_ID)

  return (
    <div
      className="ds-notice"
      data-tone="warn"
      role="alert"
      style={{ borderLeftWidth: '3px', margin: 0, borderRadius: 0 }}
    >
      <span className="ds-notice-icon" aria-hidden>!</span>
      <div className="ds-notice-body">
        <div className="ds-notice-title">Wrong network</div>
        <div className="ds-notice-message">
          Connected to {currentChainName}. Switch to {expectedChainName} to interact.
        </div>
      </div>
      <div className="ds-notice-actions" style={{ marginTop: 0 }}>
        <button
          type="button"
          className="ds-btn ds-btn--sm"
          onClick={() => switchChain({ chainId: EXPECTED_CHAIN_ID })}
        >
          switch network
        </button>
      </div>
    </div>
  )
}
