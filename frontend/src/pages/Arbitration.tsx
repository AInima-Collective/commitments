import { useAccount, useChainId } from 'wagmi'

import { ArbiterQueue } from '../components/arbiter/ArbiterQueue'
import { getContractAddresses } from '../config/contracts'

/**
 * /arbitration — arbiter-centric queue. A connected wallet that is the
 * `arbiter` on commitments sees them here, bucketed by actionability, and acts
 * on the two-phase forfeiture via the shared resolve modal.
 */
export default function Arbitration() {
  const chainId = useChainId()
  const { address, isConnected } = useAccount()
  const { commitmentManager: managerAddress } = getContractAddresses(chainId)

  return (
    <ArbiterQueue
      managerAddress={managerAddress}
      connectedAddress={address}
      isConnected={isConnected}
    />
  )
}
