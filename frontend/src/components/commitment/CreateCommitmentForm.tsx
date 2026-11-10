// CreateCommitmentForm shell: holds metadataURI / metadataHash / expiryValue in lifted state
// so switching intents preserves these three pieces of user input.
// Per UI-SPEC line 251: "Toggling modes preserves any user-entered metadataURI, metadataHash, and expiryValue."
// All other fields reset to mode defaults on switch (mode subcomponent unmounts/remounts).
import { useState } from 'react'
import { type Address } from 'viem'
import { type CommitmentWithStatus } from '../../utils/commitments'
import { ZERO_HASH } from '../../utils/metadataForm'
import { CustomMode } from './modes/CustomMode'

interface CreateCommitmentFormProps {
  managerAddress: Address | undefined
  isConnected: boolean
  connectedAddress?: Address | undefined // optional — Plan 20-03 wires it
  onCommitmentCreated: (commitment: CommitmentWithStatus) => void
}

export function CreateCommitmentForm(props: CreateCommitmentFormProps) {
  // Single full-control path. The task-first intent tabs (Back a service /
  // Gift yield / Risk coverage) were removed — risk coverage lives in the
  // marketplace, and the remaining flows are all expressible through the
  // advanced/custom body, so it is now the only create surface.

  // BLOCKER B5 — lifted state: kept across re-renders so metadata/expiry input
  // survives any in-body resets.
  const [metadataURI, setMetadataURI] = useState<string>('')
  const [metadataHash, setMetadataHash] = useState<string>(ZERO_HASH)
  const [expiryValue, setExpiryValue] = useState<string>('')

  const childProps = {
    managerAddress: props.managerAddress,
    isConnected: props.isConnected,
    connectedAddress: props.connectedAddress,
    onCommitmentCreated: props.onCommitmentCreated,
    metadataURI,
    setMetadataURI,
    metadataHash,
    setMetadataHash,
    expiryValue,
    setExpiryValue,
  }

  return (
    <div className="ds-stack ds-stack-3">
      <p className="ds-text-sm ds-muted" style={{ margin: 0 /* layout only */ }}>
        A commitment pledges stake you control to an agreement: it stays in custody
        (and keeps earning yield) while a designated arbiter can penalize you through
        a two-phase forfeit if you break the terms. Set the terms below — arbiter,
        penalty, forfeit execution delay, expiry, and metadata are all under your control.
      </p>

      <CustomMode {...childProps} />
    </div>
  )
}
