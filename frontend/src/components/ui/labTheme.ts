/**
 * Live-switchable presentation axes — palette, type stack, and brand mark.
 *
 * These are *experiment* controls, not user preferences: they exist so the
 * visual direction can be chosen against the real app rather than a mockup.
 * Selection is written to `<html>` as `data-palette` / `data-type` (the CSS in
 * styles/tokens.css keys off those attributes, so every component follows with
 * no prop threading) and mirrored into localStorage so it survives a reload.
 * The boot script in index.html replays the stored values before first paint.
 *
 * The brand mark has no CSS hook — BrandMark subscribes to this store directly
 * via useSyncExternalStore.
 *
 * When a direction is settled, collapse this module: promote the winning
 * palette/type into the base [data-theme] blocks, delete the losers, and keep
 * BrandMark's chosen geometry as the only mark.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react'

// ─── Vocabulary ─────────────────────────────────────────────────────────────

export const PALETTES = [
  {
    id: 'neutral',
    label: 'Neutral',
    note: 'True neutral grays. No temperature at all — the reference point.',
  },
  {
    id: 'bone',
    label: 'Bone',
    note: 'Warm-neutral paper. Reads as printed stock; pairs with old-style serifs.',
  },
  {
    id: 'void',
    label: 'Void',
    note: 'Pure paper, pure ink, heavy hairlines. Maximum contrast.',
  },
  {
    id: 'ash',
    label: 'Ash',
    note: 'Nothing pure at either end. Lowest glare, quietest of the four.',
  },
] as const

export const TYPE_STACKS = [
  {
    id: 'newsreader',
    label: 'Newsreader',
    note: 'Variable weight + optical size, generous italic. Holds at paragraph length.',
    mono: 'Geist Mono',
  },
  {
    id: 'instrument',
    label: 'Instrument Serif',
    note: 'Single weight, very high stroke contrast, tight fit. The book-cover voice.',
    mono: 'Geist Mono',
  },
  {
    id: 'spectral',
    label: 'Spectral',
    note: 'Sturdier, lower contrast, screen-engineered. Paired with IBM Plex Mono.',
    mono: 'IBM Plex Mono',
  },
  {
    id: 'garamond',
    label: 'EB Garamond',
    note: 'Old-style humanist, small x-height. The printed-grimoire register.',
    mono: 'Geist Mono',
  },
  {
    id: 'cormorant',
    label: 'Cormorant',
    note: 'Extreme contrast, very light stems. Most severe; fragile below ~20px.',
    mono: 'JetBrains Mono',
  },
  {
    id: 'mono',
    label: 'Mono (control)',
    note: 'No serif anywhere — what the app looked like before. Comparison baseline.',
    mono: 'Geist Mono',
  },
] as const

export type PaletteId = (typeof PALETTES)[number]['id']
export type TypeStackId = (typeof TYPE_STACKS)[number]['id']

export const DEFAULT_PALETTE: PaletteId = 'neutral'
export const DEFAULT_TYPE: TypeStackId = 'newsreader'

const PALETTE_IDS = PALETTES.map((p) => p.id) as readonly string[]
const TYPE_IDS = TYPE_STACKS.map((t) => t.id) as readonly string[]

export const PALETTE_STORAGE_KEY = 'commitments.palette'
export const TYPE_STORAGE_KEY = 'commitments.type'
export const MARK_STORAGE_KEY = 'commitments.mark'

// ─── Brand marks ────────────────────────────────────────────────────────────
// Geometry lives in BrandMark.tsx; this is the catalogue the lab enumerates.
//
// MarkId is spelled out rather than derived from MARK_GROUPS: deriving it
// through a `flatMap` over a union of `as const` tuples defeats inference, and
// the explicit union is what makes BrandMark's Record<MarkId, …> exhaustive.

export type MarkId =
  | 'seal' | 'orbit' | 'vesica' | 'sigil'
  | 'interlock' | 'dovetail' | 'bind' | 'nested'
  | 'held' | 'tally' | 'double' | 'corners'

export type MarkOption = { readonly id: MarkId; readonly label: string; readonly note: string }
export type MarkGroup = {
  readonly id: string
  readonly label: string
  readonly note: string
  readonly marks: readonly MarkOption[]
}

export const MARK_GROUPS: readonly MarkGroup[] = [
  {
    id: 'sigil',
    label: 'Sigil / seal',
    note: 'Occult-technical diagram. Reads as a seal pressed into a contract.',
    marks: [
      { id: 'seal', label: 'Seal', note: 'Ring, inscribed diamond, struck centre.' },
      { id: 'orbit', label: 'Orbit', note: 'A marked position on a cycle. Time is the mechanism.' },
      { id: 'vesica', label: 'Vesica', note: 'Two circles; the obligation is the overlap.' },
      { id: 'sigil', label: 'Sigil', note: 'Inscribed triangle. The most explicitly occult of the set.' },
    ],
  },
  {
    id: 'locked',
    label: 'Locked geometry',
    note: 'Forms that cannot be separated. Literal about mutual obligation.',
    marks: [
      { id: 'interlock', label: 'Interlock', note: 'Today’s mark restated — same idea, ink instead of orange.' },
      { id: 'dovetail', label: 'Dovetail', note: 'A keyed seam. One square, two halves that cannot slide apart.' },
      { id: 'bind', label: 'Bind', note: 'Two parties, one bond. The most legible at 12px.' },
      { id: 'nested', label: 'Nested', note: 'Obligation containing obligation — the mesh, compressed.' },
    ],
  },
  {
    id: 'bracket',
    label: 'Bracket / delimiter',
    note: 'Pure typographic marks. Sit natively beside a mono wordmark.',
    marks: [
      { id: 'held', label: 'Held', note: 'A value held between brackets. Encumbrance as a glyph.' },
      { id: 'tally', label: 'Tally', note: 'Counted and struck. The oldest ledger there is.' },
      { id: 'double', label: 'Double', note: '⟦ ⟧ — denotation brackets. Quiet, and reads as notation.' },
      { id: 'corners', label: 'Corners', note: 'Registration marks framing a void. Printed-matter reference.' },
    ],
  },
] as const

export const MARKS: readonly MarkOption[] = MARK_GROUPS.flatMap((g) => [...g.marks])

// Chosen 2026-07-24: brackets holding a solid value — encumbrance as a glyph.
// It is also the most legible of the twelve at 12px, which is the topnav size.
export const DEFAULT_MARK: MarkId = 'held'

const MARK_IDS = MARKS.map((m) => m.id) as readonly string[]

// ─── Store ──────────────────────────────────────────────────────────────────

type LabState = { palette: PaletteId; type: TypeStackId; mark: MarkId }

function readStored(key: string, allowed: readonly string[], fallback: string): string {
  if (typeof window === 'undefined') return fallback
  try {
    const stored = window.localStorage.getItem(key)
    if (stored && allowed.includes(stored)) return stored
  } catch {
    // localStorage may be unavailable (private mode etc.) — fall through
  }
  return fallback
}

function readInitial(): LabState {
  // The boot script has already stamped the dataset, so prefer it — that keeps
  // React's first render byte-identical to what the user is already looking at.
  const el = typeof document !== 'undefined' ? document.documentElement : undefined
  const fromAttr = (v: string | undefined, allowed: readonly string[]) =>
    v && allowed.includes(v) ? v : undefined

  return {
    palette: (fromAttr(el?.dataset.palette, PALETTE_IDS)
      ?? readStored(PALETTE_STORAGE_KEY, PALETTE_IDS, DEFAULT_PALETTE)) as PaletteId,
    type: (fromAttr(el?.dataset.type, TYPE_IDS)
      ?? readStored(TYPE_STORAGE_KEY, TYPE_IDS, DEFAULT_TYPE)) as TypeStackId,
    mark: (fromAttr(el?.dataset.mark, MARK_IDS)
      ?? readStored(MARK_STORAGE_KEY, MARK_IDS, DEFAULT_MARK)) as MarkId,
  }
}

let state: LabState = readInitial()
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function persist(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // localStorage may be unavailable — the dataset write below still applies
  }
}

function commit(next: LabState) {
  state = next
  if (typeof document !== 'undefined') {
    const el = document.documentElement
    el.dataset.palette = next.palette
    el.dataset.type = next.type
    el.dataset.mark = next.mark
  }
  emit()
}

export function setPalette(palette: PaletteId) {
  if (state.palette === palette) return
  persist(PALETTE_STORAGE_KEY, palette)
  commit({ ...state, palette })
}

export function setTypeStack(type: TypeStackId) {
  if (state.type === type) return
  persist(TYPE_STORAGE_KEY, type)
  commit({ ...state, type })
}

export function setMark(mark: MarkId) {
  if (state.mark === mark) return
  persist(MARK_STORAGE_KEY, mark)
  commit({ ...state, mark })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): LabState {
  return state
}

/**
 * Read the current experiment selection and the setters for changing it.
 * Returns a state shape (not an emitter) per components/ui/CONTRIBUTING.md §6.
 */
export function useLabTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setPaletteCb = useCallback((p: PaletteId) => setPalette(p), [])
  const setTypeCb = useCallback((t: TypeStackId) => setTypeStack(t), [])
  const setMarkCb = useCallback((m: MarkId) => setMark(m), [])

  return useMemo(
    () => ({
      palette: snapshot.palette,
      type: snapshot.type,
      mark: snapshot.mark,
      setPalette: setPaletteCb,
      setTypeStack: setTypeCb,
      setMark: setMarkCb,
      palettes: PALETTES,
      typeStacks: TYPE_STACKS,
      markGroups: MARK_GROUPS,
    }),
    [snapshot, setPaletteCb, setTypeCb, setMarkCb],
  )
}

/** Subscribe to just the mark — used by BrandMark, which re-renders on change. */
export function useMarkId(): MarkId {
  return useSyncExternalStore(
    subscribe,
    () => state.mark,
    () => state.mark,
  )
}
