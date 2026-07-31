import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isAddress } from 'viem'
import { useAccount } from 'wagmi'

/** Query parameter carrying the address being inspected. */
export const VIEW_PARAM = 'view'

/**
 * Read the `?view=` override, if it is a well-formed address.
 *
 * `strict: false` skips EIP-55 checksum validation. A user pasting an address
 * out of a block explorer, a terminal, or another tab has no reason to have
 * preserved its capitalisation, and rejecting a valid address because of it
 * would look like a bug.
 */
function readViewParam(params: URLSearchParams): `0x${string}` | undefined {
  const raw = params.get(VIEW_PARAM)
  if (!raw || !isAddress(raw, { strict: false })) return undefined
  return raw.toLowerCase() as `0x${string}`
}

/**
 * Whose data the page should render.
 *
 * The `?view=` parameter wins over the connected wallet, so every account
 * surface doubles as an explorer: paste an address and the dashboard,
 * commitments, and vault pages all re-render around it. Keeping it in the URL
 * rather than in component state is the point — the resulting page is a link
 * you can send to someone.
 *
 * READ ONLY. This never changes who signs a transaction: a wallet can only
 * ever act as itself. Pages must gate every write affordance on
 * {@link useViewContext}'s `isOwnView`, not on `isConnected`, or a visitor
 * inspecting someone else's position gets buttons that quietly act on their
 * own — see the banner in RootLayout, which exists to make the distinction
 * impossible to miss.
 */
export function useViewAddress(): `0x${string}` | undefined {
  const [params] = useSearchParams()
  const { address } = useAccount()
  return readViewParam(params) ?? address
}

export interface ViewContext {
  /** Address the page is rendering. */
  viewAddress: `0x${string}` | undefined
  /** Address that can actually sign. */
  connectedAddress: `0x${string}` | undefined
  /** True when the rendered address is the connected wallet — the write gate. */
  isOwnView: boolean
  /** True when an explicit `?view=` is pointing somewhere other than the wallet. */
  isViewingOther: boolean
  /** Point the app at an address. Pass `undefined` to return to the wallet. */
  setViewAddress: (next: string | undefined) => void
}

/**
 * {@link useViewAddress} plus the surrounding context: who is connected,
 * whether they match, and how to change it.
 *
 * Separate from `useViewAddress` so the common case (a page that just needs an
 * address to read) keeps a one-value return, while the shell and any write
 * gate get the full picture.
 */
export function useViewContext(): ViewContext {
  const [params, setParams] = useSearchParams()
  const { address: connectedAddress } = useAccount()
  const override = readViewParam(params)
  const viewAddress = override ?? connectedAddress

  const setViewAddress = useCallback(
    (next: string | undefined) => {
      const params2 = new URLSearchParams(window.location.search)
      if (next && isAddress(next, { strict: false })) {
        params2.set(VIEW_PARAM, next.toLowerCase())
      } else {
        params2.delete(VIEW_PARAM)
      }
      // `replace` so browser Back leaves the app rather than walking backwards
      // through every address that was typed into the box.
      setParams(params2, { replace: true })
    },
    [setParams],
  )

  return {
    viewAddress,
    connectedAddress,
    isOwnView:
      !!connectedAddress &&
      !!viewAddress &&
      viewAddress.toLowerCase() === connectedAddress.toLowerCase(),
    isViewingOther:
      !!override && (!connectedAddress || override !== connectedAddress.toLowerCase()),
    setViewAddress,
  }
}
