import {
  AddressDisplay,
  CopyButton,
  SourceBlock,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

const SRC_ADDRESS =
  `<AddressDisplay address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e" />
<AddressDisplay address="0xab5801…aec9b" ens="vault.eth" explorerUrl="https://…" />

// Any other value worth copying (a hash, a URI) gets a CopyButton beside it.
<CopyButton value={hash} label="Copy content hash" />
<CopyButton value={uri} label="Copy metadata URI" inline />`

export function AddressSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="address"
        title="Address Display"
        lead="Full hex on desktop, middle-truncated under 640px. The whole row is a click-to-copy hit area; the explorer link is a separate target. Resize the window to see the truncation switch."
      />
      <div className="ds-stack ds-stack-4">
        <div className="ds-stack ds-stack-2">
          <div className="ds-label">plain</div>
          <AddressDisplay address="0xC4f7000000000000000000000000000000003Ab9" />
        </div>
        <div className="ds-stack ds-stack-2">
          <div className="ds-label">with explorer link</div>
          <AddressDisplay
            address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
            explorerUrl="https://etherscan.io/address/0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
          />
        </div>
        <div className="ds-stack ds-stack-2">
          <div className="ds-label">resolved ens</div>
          <span className="ds-row ds-row-2">
            <AddressDisplay
              address="0xab5801a7d398351b8be11c439e05c5b3259aec9b"
              ens="vault.eth"
              explorerUrl="https://etherscan.io/name/vault.eth"
            />
            <span className="ds-badge ds-badge--accent">ENS</span>
          </span>
        </div>
        <div className="ds-stack ds-stack-2">
          <div className="ds-label">inline · self</div>
          <span className="ds-row ds-row-2">
            <AddressDisplay address="0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97" />
            <span className="ds-badge ds-badge--solid">YOU</span>
          </span>
        </div>
        <div className="ds-stack ds-stack-2">
          <div className="ds-label">copy button · icon · inline</div>
          <span className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
            <span className="ds-row ds-row-2">
              <code className="ds-text-sm" title="0x47c8a4b1f3e9d2b5a8c6f0e1d3b7a9f2e8c4d6b1a5f9c3e7b2d4a6f8c1e9b3d5">0x47c8a4b1…c1e9b3d5</code>
              <CopyButton
                value="0x47c8a4b1f3e9d2b5a8c6f0e1d3b7a9f2e8c4d6b1a5f9c3e7b2d4a6f8c1e9b3d5"
                label="Copy content hash"
              />
            </span>
            <span className="ds-row ds-row-2">
              <code className="ds-text-sm" title="ipfs://bafkreigh2akiscaildc3xwmamkdkzsxwt4kp4kk4f7klqpd4ufnfbazlta">ipfs://bafkreigh2…azlta</code>
              <CopyButton
                value="ipfs://bafkreigh2akiscaildc3xwmamkdkzsxwt4kp4kk4f7klqpd4ufnfbazlta"
                label="Copy metadata URI"
                inline
              />
            </span>
          </span>
        </div>
      </div>
      <SourceBlock label="example" source={SRC_ADDRESS} />
    </section>
  )
}
