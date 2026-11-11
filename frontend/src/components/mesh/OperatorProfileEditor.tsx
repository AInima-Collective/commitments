import { useEffect, useMemo, useState } from 'react'
import { type Address, type Hex, zeroHash } from 'viem'
import { operatorRegistryAbi } from '../../generated'
import {
  computeHashFromJsonText,
  resolveMetadataArgs,
  validateMetadataHash,
  validateMetadataURI,
} from '../../lib/metadataForm'
import { type MetadataResult } from '../../hooks/useIndexerMetadata'
import { useWriteAction } from '../../hooks/useWriteAction'
import { Button, Input, Notice } from '../ui'
import { OperatorProfileCard } from './OperatorProfileCard'

interface Props {
  operatorAddress: Address
  registryAddress: Address | undefined
  metadata: MetadataResult
}

/**
 * `OperatorProfileEditor` — Phase 26-02 v2.4 design-system editor for the
 * `OperatorRegistry.setOperatorMetadata(uri, hash)` write path.
 *
 * - URI input: `<textarea className="ds-input">` (per 24-03 CreateCommitmentForm pattern
 *   for textareas — the `<Input>` primitive wraps `<input>` only).
 * - Content hash: `<Input>` primitive.
 * - Validation errors / warnings surface via `<Notice tone="danger|warn">`.
 * - Transaction state: `useToasts` (panel-owns-success / button-owns-error
 *   split per Phase 24-03). `disabledSave` carries the implicit pending state.
 * - Buttons: `.ds-btn` family (.ds-btn--primary SAVE, .ds-btn for RESET, .ds-btn--sm COMPUTE HASH).
 * - Outer chrome: `<section className="ds-card">` (parent OperatorDetail does
 *   NOT wrap, so the editor owns its own card).
 */
export function OperatorProfileEditor({ operatorAddress, registryAddress, metadata }: Props) {
  const initialUri = metadata.uri ?? ''
  const initialHash = metadata.hash ?? ''

  const [uri, setUri] = useState(initialUri)
  const [hash, setHash] = useState(initialHash)
  const [scratch, setScratch] = useState('')

  const [uriError, setUriError] = useState<string | null>(null)
  const [uriWarning, setUriWarning] = useState<string | null>(null)
  const [hashError, setHashError] = useState<string | null>(null)

  // Re-populate when the metadata hook delivers fresh values (e.g. first load, refetch).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reseed the form when the loaded metadata changes
    setUri(metadata.uri ?? '')
    setHash(metadata.hash ?? '')
  }, [metadata.uri, metadata.hash])

  const parsedPreview = useMemo<Record<string, unknown> | null>(() => {
    if (scratch.trim().length === 0) return null
    try {
      const j = JSON.parse(scratch) as unknown
      return typeof j === 'object' && j !== null ? (j as Record<string, unknown>) : null
    } catch {
      return null
    }
  }, [scratch])

  // PROFILE UPDATED toast on receipt success, then refresh the indexer-driven
  // metadata; the write resets after a moment so SAVE re-enables cleanly.
  const { write: writeContract, isPending, isConfirming } = useWriteAction({
    successTitle: 'PROFILE UPDATED',
    onSuccess: () => metadata.refetch(),
  })

  function handleUri(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setUri(e.target.value)
    const r = validateMetadataURI(e.target.value)
    setUriError(r.error)
    setUriWarning(r.warning)
  }

  function handleHash(e: React.ChangeEvent<HTMLInputElement>) {
    setHash(e.target.value)
    const r = validateMetadataHash(e.target.value)
    setHashError(r.error)
  }

  function handleCompute() {
    const h: Hex = computeHashFromJsonText(scratch)
    setHash(h)
    setHashError(null)
  }

  function handleReset() {
    setUri(metadata.uri ?? '')
    setHash(metadata.hash ?? '')
    setScratch('')
    setUriError(null)
    setUriWarning(null)
    setHashError(null)
  }

  function handleSave() {
    if (!registryAddress) return
    if (uriError || hashError) return
    const { uri: uriArg, hash: hashArg } = resolveMetadataArgs(uri, hash)
    writeContract({
      abi: operatorRegistryAbi,
      address: registryAddress,
      functionName: 'setOperatorMetadata',
      args: [uriArg, hashArg],
    })
  }

  const disabledSave = !!uriError || !!hashError || isPending || isConfirming

  return (
    <section className="ds-card">
      <h3>EDIT PROFILE</h3>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <label
          className="ds-muted"
          htmlFor={`op-md-uri-${operatorAddress}`}
          style={{ display: 'block', marginBottom: 'var(--space-1)' }}
        >
          METADATA URI
        </label>
        <textarea
          id={`op-md-uri-${operatorAddress}`}
          className="ds-input"
          rows={2}
          value={uri}
          onChange={handleUri}
          placeholder="ipfs://... or https://..."
          style={{ width: '100%' }}
        />
        <div className="ds-muted" style={{ marginTop: 'var(--space-1)' }}>
          {new TextEncoder().encode(uri).length} / 512 CHARS
        </div>
        {uriError && (
          <Notice tone="danger" size="sm">
            {uriError}
          </Notice>
        )}
        {uriWarning && !uriError && (
          <Notice tone="warn" size="sm">
            {uriWarning}
          </Notice>
        )}
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <label
          className="ds-muted"
          htmlFor={`op-md-hash-${operatorAddress}`}
          style={{ display: 'block', marginBottom: 'var(--space-1)' }}
        >
          CONTENT HASH
        </label>
        <Input
          id={`op-md-hash-${operatorAddress}`}
          type="text"
          value={hash}
          onChange={handleHash}
          placeholder={zeroHash}
          aria-label="CONTENT HASH"
          style={{ width: '100%' }}
        />
        {hashError && (
          <Notice tone="danger" size="sm">
            {hashError}
          </Notice>
        )}
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <label
          className="ds-muted"
          htmlFor={`op-md-scratch-${operatorAddress}`}
          style={{ display: 'block', marginBottom: 'var(--space-1)' }}
        >
          OPTIONAL: COMPUTE HASH FROM JSON
        </label>
        <textarea
          id={`op-md-scratch-${operatorAddress}`}
          className="ds-input"
          rows={3}
          value={scratch}
          onChange={(e) => setScratch(e.target.value)}
          placeholder='{"schemaVersion":"operator.v1","name":"..."}'
          style={{ width: '100%' }}
        />
        <Button
          size="sm"
          onClick={handleCompute}
          disabled={scratch.length === 0}
          style={{ marginTop: 'var(--space-2)' }}
        >
          COMPUTE HASH
        </Button>
      </div>

      {parsedPreview && (
        <>
          <div className="ds-muted">PREVIEW</div>
          <OperatorProfileCard profile={parsedPreview} preview />
        </>
      )}

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-3)',
        }}
      >
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={disabledSave}
        >
          SAVE PROFILE
        </Button>
        <Button
          onClick={handleReset}
          disabled={isPending || isConfirming}
        >
          RESET PROFILE
        </Button>
      </div>
    </section>
  )
}
