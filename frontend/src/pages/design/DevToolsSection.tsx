import {
  ActorSwitcher,
  TimeControls,
} from '../../components/protocol'
import { DevWalletProvider } from '../../contexts/DevWalletProvider'
import { SectionHeading } from './SectionHeading'

// Static demo controller so /design renders without an actual anvil node.
const STUB_TIME_CONTROLLER = {
  now: BigInt(Math.floor(Date.UTC(2026, 3, 29, 14, 32) / 1000)),
  blockNumber: 12_345n,
  isLoading: false,
  refresh: async () => {},
  advance: async () => {},
  mine: async () => {},
  warpTo: async () => {},
  setAutomine: async () => {},
}

function DevToolsDemo() {
  return (
    <DevWalletProvider>
      <div className="ds-stack ds-stack-4">
        <div className="ds-stack ds-stack-2">
          <div className="ds-text-sm ds-muted">Actor switcher</div>
          <ActorSwitcher />
        </div>
        <div className="ds-stack ds-stack-2">
          <div className="ds-text-sm ds-muted">Time controls (stubbed)</div>
          <TimeControls controller={STUB_TIME_CONTROLLER} />
        </div>
        <div className="ds-text-xs ds-subtle">
          These primitives only function on chainId 31337 inside the /admin tree —
          this preview uses a stub controller and the standard Anvil mnemonic.
        </div>
      </div>
    </DevWalletProvider>
  )
}

export function DevToolsSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="dev-tools"
        title="Dev Tools"
        lead="Anvil-only primitives that drive the /admin page — actor switcher (presets from the standard test mnemonic) and time controls (1d / 14d / 90d windows plus free-form advance, mine, and warp-to). These compose into a sticky header on /admin so a developer can take the protocol through every state without leaving the browser."
      />
      <DevToolsDemo />
    </section>
  )
}
