import { DelegateMode, type DelegateModeProps } from './DelegateMode'

/**
 * CustomMode — the "Advanced / custom" create intent. In the single-form
 * design this is the same full-control body as DelegateMode, but with the
 * Advanced-terms section expanded from the start and no preset penalty. Keeping
 * it a distinct mode lets the intent picker route to it explicitly while the
 * shared body (and its `buildCustomParams` seam) lives in one place.
 */
export function CustomMode(props: Omit<DelegateModeProps, 'defaults' | 'advancedDefaultOpen'>) {
  return <DelegateMode {...props} advancedDefaultOpen />
}
