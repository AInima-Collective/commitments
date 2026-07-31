import { useState } from 'react'
import { isAddress } from 'viem'
import { useViewContext } from '../../hooks/useViewAddress'

/**
 * Address box in the top bar — the "or paste an Ethereum address above" that
 * every account page's empty state has been promising.
 *
 * Commits on submit rather than on change: an address is 42 characters, and
 * re-running every read on the app's most expensive pages after each keystroke
 * would fire forty wasted request waves per paste. Invalid input is reported
 * on the field instead of silently doing nothing, since a mistyped address
 * looks identical to an address with no activity.
 */
export function ViewAddressInput() {
  const { viewAddress, connectedAddress, isViewingOther, setViewAddress } = useViewContext()
  const shown = isViewingOther && viewAddress ? viewAddress : ''
  // Remount on change rather than syncing the field in an effect. The draft is
  // local state seeded from the URL, and `key` is React's own answer to
  // "reset local state when the thing it describes changes" — an effect would
  // re-render every consumer of this header twice on every navigation.
  return (
    <ViewAddressField
      key={shown}
      initialValue={shown}
      canClear={isViewingOther}
      hasWallet={!!connectedAddress}
      onSubmit={setViewAddress}
    />
  )
}

function ViewAddressField({
  initialValue,
  canClear,
  hasWallet,
  onSubmit,
}: {
  initialValue: string
  canClear: boolean
  hasWallet: boolean
  onSubmit: (next: string | undefined) => void
}) {
  const [draft, setDraft] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = draft.trim()
    if (!value) {
      setError(null)
      onSubmit(undefined)
      return
    }
    if (!isAddress(value, { strict: false })) {
      setError('Not an Ethereum address')
      return
    }
    setError(null)
    onSubmit(value)
  }

  return (
    <form className="ds-view-as" onSubmit={submit} role="search">
      <label className="ds-sr-only" htmlFor="view-as-input">
        View any Ethereum address
      </label>
      <input
        id="view-as-input"
        className="ds-input ds-view-as-input"
        type="text"
        spellCheck={false}
        autoComplete="off"
        placeholder="view an address"
        value={draft}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'view-as-error' : undefined}
        onChange={(e) => {
          setDraft(e.target.value)
          if (error) setError(null)
        }}
      />
      {canClear && (
        <button
          type="button"
          className="ds-view-as-clear"
          // Without a wallet there is nothing to return to, so the button says
          // what it does rather than promising a wallet that isn't there.
          aria-label={hasWallet ? 'Back to my wallet' : 'Clear address'}
          title={hasWallet ? 'Back to my wallet' : 'Clear address'}
          onClick={() => onSubmit(undefined)}
        >
          ✕
        </button>
      )}
      {error && (
        <span id="view-as-error" role="alert" className="ds-view-as-error">
          {error}
        </span>
      )}
    </form>
  )
}
