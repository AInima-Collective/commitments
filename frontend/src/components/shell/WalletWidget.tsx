import { useEffect, useRef, useState } from 'react'
import { useAccount, useConnect, useConnectors, useDisconnect, useSwitchChain } from 'wagmi'
import { OperatorAvatar } from '../ui'
import { EXPECTED_CHAIN_ID } from '../../config/wagmi'
import { chainName } from '../../lib/chainName'

function truncate(addr: string, lead = 6, tail = 4): string {
  if (addr.length <= lead + tail + 1) return addr
  return `${addr.slice(0, lead)}\u2026${addr.slice(-tail)}`
}

export function WalletWidget() {
  const { address, isConnected, isConnecting, chainId } = useAccount()
  const { connect } = useConnect()
  const connectors = useConnectors()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const [showConnectors, setShowConnectors] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showConnectors && !showMenu) return
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setShowConnectors(false)
        setShowMenu(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowConnectors(false)
        setShowMenu(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [showConnectors, showMenu])

  const onCopy = async () => {
    if (!address) return
    try {
      await navigator.clipboard?.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* ignore */
    }
  }

  if (isConnecting) {
    return (
      <button type="button" className="ds-btn ds-btn--sm" disabled>
        <span className="ds-spinner ds-spinner--xs" aria-hidden />
        connecting…
      </button>
    )
  }

  if (isConnected && address) {
    const wrongNetwork = chainId !== EXPECTED_CHAIN_ID
    return (
      <div ref={wrapRef} className="ds-wallet">
        <button
          type="button"
          className="ds-wallet-trigger"
          aria-haspopup="menu"
          aria-expanded={showMenu}
          aria-label={`Wallet ${address}`}
          onClick={() => setShowMenu((v) => !v)}
          data-warn={wrongNetwork || undefined}
        >
          <OperatorAvatar address={address} size="sm" />
          <span className="ds-wallet-trigger-addr">{truncate(address)}</span>
          {wrongNetwork && (
            <span className="ds-glyph ds-glyph--warn ds-wallet-trigger-warn" aria-hidden>!</span>
          )}
          <span className="ds-wallet-trigger-caret" aria-hidden>▾</span>
        </button>
        {showMenu && (
          <div
            className="ds-dropdown-panel ds-dropdown-panel--end ds-wallet-menu"
            role="menu"
            style={{ display: 'flex' }}
          >
            <div className="ds-wallet-menu-head" role="presentation">
              <OperatorAvatar address={address} size="md" />
              <div className="ds-wallet-menu-head-text">
                <span className="ds-wallet-menu-addr">{truncate(address, 8, 6)}</span>
                <span className="ds-wallet-menu-net">
                  <span
                    className={`ds-glyph ${wrongNetwork ? 'ds-glyph--warn' : 'ds-glyph--ok'}`}
                    aria-hidden
                  >●</span>
                  {chainName(chainId)}
                </span>
              </div>
            </div>
            <hr className="ds-divider" aria-hidden />
            <button
              type="button"
              role="menuitem"
              className="ds-dropdown-link"
              onClick={onCopy}
            >
              {copied ? 'Copied' : 'Copy address'}
            </button>
            {wrongNetwork && (
              <button
                type="button"
                role="menuitem"
                className="ds-dropdown-link"
                onClick={() => switchChain({ chainId: EXPECTED_CHAIN_ID })}
              >
                Switch to {chainName(EXPECTED_CHAIN_ID)}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="ds-dropdown-link"
              onClick={() => {
                disconnect()
                setShowMenu(false)
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="ds-wallet">
      <button
        type="button"
        className="ds-btn ds-btn--sm ds-btn--primary"
        aria-haspopup="menu"
        aria-expanded={showConnectors}
        onClick={() => setShowConnectors((v) => !v)}
      >
        connect wallet
      </button>
      {showConnectors && (
        <div
          className="ds-dropdown-panel ds-dropdown-panel--end"
          role="menu"
          style={{ display: 'flex' }}
        >
          <div className="ds-dropdown-section">connect with</div>
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              role="menuitem"
              className="ds-dropdown-link ds-wallet-connector"
              onClick={() => {
                connect({ connector })
                setShowConnectors(false)
              }}
            >
              {connector.icon ? (
                <img src={connector.icon} alt="" className="ds-wallet-connector-icon" />
              ) : (
                <span className="ds-wallet-connector-icon ds-wallet-connector-icon--placeholder" aria-hidden>
                  {connector.name.slice(0, 1)}
                </span>
              )}
              <span>{connector.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
