import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Button, CopyButton, Disclosure, Input, Notice, SourceBlock, TokenChip } from '../ui'
import { useMetadataPin, type MetadataPinResult } from '../../hooks/useMetadataPin'
import {
  MAX_INLINE_JSON_BYTES,
  ZERO_HASH,
  computeHashFromJsonText,
  resolveMetadataArgs,
  validateMetadataHash,
  validateMetadataURI,
} from '../../utils/metadataForm'

/**
 * Schemas this editor knows how to author. The schema is a prop so the same
 * component serves both commitment creation and agreement proposals — see
 * docs/protocol/reference/concepts/metadata.md for the field tables.
 */
export type MetadataSchema = 'commitment.v1' | 'agreement.v1'

/** The pair surfaced to the parent form, ready to write on-chain. */
export interface MetadataEditorValue {
  metadataURI: string
  metadataHash: `0x${string}`
}

/**
 * Authoring status, for parents that need to gate submit:
 *   empty — nothing entered; the form may submit with no metadata.
 *   dirty — fields entered but not yet pinned/applied; submit should be blocked
 *           so half-authored metadata is never silently dropped.
 *   ready — a `{ metadataURI, metadataHash }` pair is surfaced and current.
 */
export type MetadataEditorStatus = 'empty' | 'dirty' | 'ready'

export interface MetadataEditorProps {
  /** Which schema's fields to render (`commitment.v1` | `agreement.v1`). */
  schema: MetadataSchema
  /**
   * Notified whenever the surfaced value changes: a `{ metadataURI,
   * metadataHash }` pair once pinned/applied, or `null` whenever the user
   * re-edits and invalidates a previously-pinned result.
   */
  onChange?: (value: MetadataEditorValue | null) => void
  /**
   * Notified whenever the authoring status changes. Lets a parent block submit
   * while the user has entered metadata that has not yet been pinned/applied
   * (`dirty`) — see {@link MetadataEditorStatus}.
   */
  onStatusChange?: (status: MetadataEditorStatus) => void
  /** Disable all inputs (e.g. while the parent transaction is pending). */
  disabled?: boolean
  /** Extra class names appended to the root. */
  className?: string
}

interface FieldDef {
  key: string
  label: string
  required?: boolean
  multiline?: boolean
  kind?: 'text' | 'tags'
  placeholder?: string
}

// Field tables transcribed from metadata-conventions.md (§Commitment v1,
// §Agreement v1). `title` is required for both; everything else optional.
const SCHEMA_FIELDS: Record<MetadataSchema, FieldDef[]> = {
  'commitment.v1': [
    { key: 'title', label: 'TITLE', required: true, placeholder: 'Weekly data delivery' },
    { key: 'description', label: 'DESCRIPTION', multiline: true, placeholder: 'Longer prose — markdown allowed' },
    { key: 'termsURI', label: 'TERMS URI', placeholder: 'ipfs://… or https://…' },
    { key: 'tags', label: 'TAGS', kind: 'tags' },
    { key: 'trustgraphsAttestationId', label: 'TRUSTGRAPHS ATTESTATION ID', placeholder: 'attestation reference' },
  ],
  'agreement.v1': [
    { key: 'title', label: 'TITLE', required: true, placeholder: 'Cross-operator SLA bridge' },
    { key: 'description', label: 'DESCRIPTION', multiline: true, placeholder: 'Longer prose — markdown allowed' },
    { key: 'agreementURI', label: 'AGREEMENT URI', placeholder: 'ipfs://… or https://…' },
    { key: 'proposerContact', label: 'PROPOSER CONTACT', placeholder: 'alice.eth, email, or Signal handle' },
    { key: 'tags', label: 'TAGS', kind: 'tags' },
  ],
}

function truncateHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/**
 * Check a freshly-pinned result against the on-chain URI cap, and explain the
 * failure in terms of the thing that actually caused it.
 *
 * A pin can succeed and still hand back a URI the contract will reject. With
 * no pinning credentials the endpoint falls back to inlining the whole
 * document as `data:application/json;base64,…`, whose length grows with the
 * payload. Past roughly 360 bytes of JSON the URI clears 512 bytes and
 * `createCommitment` reverts during gas estimation, long after the form has
 * reported success. That is the failure this guard exists to prevent, and
 * telling the author "your URI is too long" would be blaming the wrong thing:
 * their description is fine, the storage backend is the constraint.
 *
 * Returns null when the URI is fine.
 */
function pinnedURIProblem(pinned: MetadataPinResult, payloadText: string): string | null {
  if (!validateMetadataURI(pinned.metadataURI).error) return null

  if (pinned.service === 'data-uri') {
    const over = byteLength(payloadText) - MAX_INLINE_JSON_BYTES
    return (
      `There is no pinning service configured, so this metadata was written straight into the URI, ` +
      `and the result is too long to store on chain. ` +
      `Either trim about ${over > 0 ? over : 1} more ${over === 1 ? 'character' : 'characters'} from the fields above, ` +
      `or point the indexer at an IPFS node so the URI becomes a short reference instead of the whole document.`
    )
  }
  return `The pinned URI is ${byteLength(pinned.metadataURI)} bytes, over the 512-byte limit the contract accepts.`
}

/**
 * `MetadataEditor` — reusable, flow-agnostic authoring shell for protocol
 * metadata. Structured fields (driven by {@link MetadataSchema}) are the inline
 * default; the legacy raw `metadataURI` + `metadataHash` paste path is tucked
 * into an "Advanced" disclosure for power users who already hold a pinned URI.
 *
 * On pin it serializes the structured fields to JSON, POSTs the *exact bytes*
 * to the indexer's `/metadata/pin` endpoint (via {@link useMetadataPin}), and
 * surfaces the returned `{ metadataURI, metadataHash }` to the parent through
 * `onChange`. The endpoint hashes the posted bytes, so that hash is
 * authoritative and is never recomputed here. `computeHashFromJsonText` is
 * preserved only for the manual/advanced path.
 *
 * Layer: feature shell (`components/metadata/`). It is protocol-aware (knows
 * the `commitment.v1` / `agreement.v1` schemas) so it must not live in
 * `components/ui/`; it composes only `ui/` primitives below it.
 */
export function MetadataEditor({ schema, onChange, onStatusChange, disabled = false, className }: MetadataEditorProps) {
  const fields = SCHEMA_FIELDS[schema]
  const idBase = useId()
  const pinFlow = useMetadataPin()

  // Structured field state.
  const [values, setValues] = useState<Record<string, string>>({})
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)

  // The single surfaced value (from the structured pin OR the manual path).
  const [surfaced, setSurfaced] = useState<MetadataEditorValue | null>(null)

  // A pin that returned an unusable URI. Held separately from `pinFlow.error`
  // because the request itself succeeded — what failed is the result.
  const [pinRejection, setPinRejection] = useState<string | null>(null)

  // Advanced / manual paste state.
  const [manualUri, setManualUri] = useState('')
  const [manualHash, setManualHash] = useState('')
  const [scratch, setScratch] = useState('')

  const surface = useCallback(
    (value: MetadataEditorValue | null) => {
      setSurfaced(value)
      onChange?.(value)
    },
    [onChange],
  )

  // Re-editing any input after a result was surfaced invalidates it.
  const invalidate = useCallback(() => {
    if (surfaced) surface(null)
    if (pinFlow.status !== 'idle') pinFlow.reset()
    setPinRejection(null)
  }, [surfaced, surface, pinFlow])

  const title = values.title?.trim() ?? ''

  // Build the metadata JSON. Optional fields are omitted when blank; tags only
  // when non-empty. Iterated in schema order so the serialized preview reads
  // top-to-bottom like the form.
  const payloadText = useMemo(() => {
    const obj: Record<string, unknown> = { schemaVersion: schema }
    for (const f of fields) {
      if (f.kind === 'tags') {
        if (tags.length > 0) obj.tags = tags
      } else {
        const v = values[f.key]?.trim()
        if (v) obj[f.key] = v
      }
    }
    return JSON.stringify(obj, null, 2)
  }, [schema, fields, values, tags])

  // Shown live: the on-chain URI cap is a byte budget, and the author has no
  // other way to see how close their prose is to blowing it.
  const payloadBytes = useMemo(() => byteLength(payloadText), [payloadText])

  const setField = useCallback(
    (key: string, value: string) => {
      setValues((prev) => ({ ...prev, [key]: value }))
      invalidate()
    },
    [invalidate],
  )

  const addTag = useCallback(() => {
    const t = tagDraft.trim()
    if (t.length === 0) return
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]))
    setTagDraft('')
    invalidate()
  }, [tagDraft, invalidate])

  const removeTag = useCallback(
    (tag: string) => {
      setTags((prev) => prev.filter((t) => t !== tag))
      invalidate()
    },
    [invalidate],
  )

  const handlePin = useCallback(async () => {
    if (title.length === 0) {
      setTitleTouched(true)
      return
    }
    setPinRejection(null)
    const pinned = await pinFlow.pin(payloadText)
    if (!pinned) return
    const problem = pinnedURIProblem(pinned, payloadText)
    if (problem) {
      // Never surface a pair the contract would reject. Reporting success here
      // is what turns a fixable form error into an unexplained transaction
      // failure two screens later.
      setPinRejection(problem)
      return
    }
    surface({ metadataURI: pinned.metadataURI, metadataHash: pinned.metadataHash })
  }, [title, pinFlow, payloadText, surface])

  // --- Advanced / manual path -------------------------------------------------
  const manualUriValidation = validateMetadataURI(manualUri)
  const manualHashValidation = validateMetadataHash(manualHash)
  const manualValid =
    manualUri.trim().length > 0 && !manualUriValidation.error && !manualHashValidation.error

  const handleComputeHash = useCallback(() => {
    if (scratch.trim().length === 0) return
    setManualHash(computeHashFromJsonText(scratch))
    invalidate()
  }, [scratch, invalidate])

  const handleApplyManual = useCallback(() => {
    if (!manualValid) return
    const { uri, hash } = resolveMetadataArgs(manualUri, manualHash)
    surface({ metadataURI: uri, metadataHash: hash })
  }, [manualValid, manualUri, manualHash, surface])

  const isPinning = pinFlow.status === 'pinning'
  const controlsDisabled = disabled || isPinning

  // Derive the authoring status and notify the parent on change. `dirty` means
  // the user has typed something (structured fields, tags, or the manual paste
  // path) but no result is currently surfaced — the parent should block submit.
  const hasStructuredInput = useMemo(
    () => tags.length > 0 || Object.values(values).some((v) => v.trim().length > 0),
    [values, tags],
  )
  const hasManualInput = manualUri.trim().length > 0 || manualHash.trim().length > 0
  const status: MetadataEditorStatus = surfaced ? 'ready' : hasStructuredInput || hasManualInput ? 'dirty' : 'empty'
  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  return (
    <div className={['ds-stack', 'ds-stack-4', className].filter(Boolean).join(' ')}>
      <div className="ds-stack ds-stack-1">
        <div className="ds-label">METADATA · {schema}</div>
        <div className="ds-text-xs ds-subtle">
          Author structured metadata inline; pinning produces the on-chain URI + hash.
        </div>
      </div>

      {/* Structured fields */}
      {fields.map((f) => {
        const fieldId = `${idBase}-${f.key}`
        if (f.kind === 'tags') {
          return (
            <div key={f.key} className="ds-field">
              <label className="ds-label" htmlFor={fieldId}>
                {f.label}
              </label>
              {tags.length > 0 && (
                <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap' }}>
                  {tags.map((t) => (
                    <span key={t} className="ds-row ds-row-1" style={{ alignItems: 'center' }}>
                      <TokenChip symbol={t} />
                      <Button
                        size="sm"
                        aria-label={`Remove tag ${t}`}
                        title={`Remove tag ${t}`}
                        onClick={() => removeTag(t)}
                        disabled={controlsDisabled}
                      >
                        ×
                      </Button>
                    </span>
                  ))}
                </div>
              )}
              <div className="ds-row ds-row-2">
                <Input
                  id={fieldId}
                  type="text"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag()
                    }
                  }}
                  placeholder="Add a tag and press Enter"
                  disabled={controlsDisabled}
                  style={{ flex: 1 }}
                />
                <Button size="sm" onClick={addTag} disabled={controlsDisabled || tagDraft.trim().length === 0}>
                  ADD TAG
                </Button>
              </div>
            </div>
          )
        }

        const showTitleError = f.required && titleTouched && title.length === 0
        return (
          <div key={f.key} className="ds-field">
            <label className="ds-label" htmlFor={fieldId}>
              {f.label}
              {f.required ? ' *' : ''}
            </label>
            {f.multiline ? (
              <textarea
                id={fieldId}
                className="ds-input"
                rows={3}
                value={values[f.key] ?? ''}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={f.placeholder}
                disabled={controlsDisabled}
                style={{ width: '100%' }}
              />
            ) : (
              <Input
                id={fieldId}
                type="text"
                value={values[f.key] ?? ''}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={f.placeholder}
                disabled={controlsDisabled}
                tone={showTitleError ? 'danger' : 'neutral'}
              />
            )}
            {showTitleError && (
              <Notice tone="danger" size="sm">
                TITLE IS REQUIRED
              </Notice>
            )}
          </div>
        )
      })}

      {/* Preview of the exact bytes that will be pinned */}
      <SourceBlock label="metadata payload" language="json" source={payloadText} />
      <div className="ds-field-helper">
        {payloadBytes} BYTES
        {payloadBytes > MAX_INLINE_JSON_BYTES && (
          <>
            {' · '}
            <span data-tone="warn">
              over the {MAX_INLINE_JSON_BYTES}-byte limit for inline storage; needs a pinning service
            </span>
          </>
        )}
      </div>

      <div className="ds-row ds-row-2" style={{ alignItems: 'center' }}>
        <Button variant="primary" onClick={handlePin} disabled={controlsDisabled || title.length === 0}>
          {isPinning ? 'PINNING…' : surfaced ? 'RE-PIN METADATA' : 'PIN METADATA'}
        </Button>
        {surfaced && (
          <span className="ds-text-xs ds-subtle">Edit any field to invalidate and re-pin.</span>
        )}
      </div>

      {/* Result / error states */}
      {pinFlow.status === 'error' && pinFlow.error && (
        <Notice tone="danger" size="sm" title="PIN FAILED">
          {pinFlow.error}
        </Notice>
      )}

      {pinRejection && (
        <Notice tone="danger" size="sm" title="METADATA TOO LARGE TO STORE ON CHAIN">
          {pinRejection}
        </Notice>
      )}

      {surfaced && (
        <Notice tone="success" size="sm" title="METADATA READY">
          <div className="ds-stack ds-stack-2">
            <div className="ds-row ds-row-2" style={{ alignItems: 'center' }}>
              <span className="ds-label">URI</span>
              <span className="ds-text-xs" style={{ wordBreak: 'break-all', flex: 1 }} title={surfaced.metadataURI}>
                {surfaced.metadataURI}
              </span>
              <CopyButton value={surfaced.metadataURI} label="Copy URI" inline />
            </div>
            <div className="ds-row ds-row-2" style={{ alignItems: 'center' }}>
              <span className="ds-label">HASH</span>
              <span className="ds-text-xs" title={surfaced.metadataHash}>
                {truncateHash(surfaced.metadataHash)}
              </span>
              <CopyButton value={surfaced.metadataHash} label="Copy hash" inline />
            </div>
          </div>
        </Notice>
      )}

      {/* Advanced: raw URI/hash paste for already-pinned metadata */}
      <Disclosure label="ADVANCED · PASTE PINNED URI + HASH">
        <div className="ds-stack ds-stack-3">
          <div className="ds-text-xs ds-subtle">
            For metadata you have already pinned elsewhere. Paste the URI and content hash directly; the bytes
            at the URI must hash to the value below or the indexer will mark it as a mismatch.
          </div>

          <div className="ds-field">
            <label className="ds-label" htmlFor={`${idBase}-manual-uri`}>
              METADATA URI
            </label>
            <textarea
              id={`${idBase}-manual-uri`}
              className="ds-input"
              rows={2}
              value={manualUri}
              onChange={(e) => {
                setManualUri(e.target.value)
                invalidate()
              }}
              placeholder="ipfs://… or https://…"
              disabled={controlsDisabled}
              style={{ width: '100%' }}
            />
            <div className="ds-field-helper">{new TextEncoder().encode(manualUri).length} / 512 BYTES</div>
            {manualUriValidation.error && (
              <Notice tone="danger" size="sm">
                {manualUriValidation.error}
              </Notice>
            )}
            {manualUriValidation.warning && !manualUriValidation.error && (
              <Notice tone="warn" size="sm">
                {manualUriValidation.warning}
              </Notice>
            )}
          </div>

          <div className="ds-field">
            <label className="ds-label" htmlFor={`${idBase}-manual-hash`}>
              CONTENT HASH
            </label>
            <Input
              id={`${idBase}-manual-hash`}
              type="text"
              value={manualHash}
              onChange={(e) => {
                setManualHash(e.target.value)
                invalidate()
              }}
              placeholder={ZERO_HASH}
              disabled={controlsDisabled}
              tone={manualHashValidation.error ? 'danger' : 'neutral'}
              style={{ width: '100%' }}
            />
            {manualHashValidation.error && (
              <Notice tone="danger" size="sm">
                {manualHashValidation.error}
              </Notice>
            )}
          </div>

          <div className="ds-field">
            <label className="ds-label" htmlFor={`${idBase}-manual-scratch`}>
              OPTIONAL · COMPUTE HASH FROM JSON
            </label>
            <textarea
              id={`${idBase}-manual-scratch`}
              className="ds-input"
              rows={3}
              value={scratch}
              onChange={(e) => setScratch(e.target.value)}
              placeholder={'{"schemaVersion":"' + schema + '","title":"…"}'}
              disabled={controlsDisabled}
              style={{ width: '100%' }}
            />
            <Button
              size="sm"
              onClick={handleComputeHash}
              disabled={controlsDisabled || scratch.trim().length === 0}
            >
              COMPUTE HASH
            </Button>
          </div>

          <Button onClick={handleApplyManual} disabled={controlsDisabled || !manualValid}>
            USE THIS METADATA
          </Button>
        </div>
      </Disclosure>
    </div>
  )
}
