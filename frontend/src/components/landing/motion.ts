// Landing-only motion vocabulary. Hoists the section-reveal config that
// otherwise drifted across Hero / PrimitiveSection / CompositionSection /
// ApplicationsSection / ClosingSection (durations 0.45–0.65, y offsets 12/16).
//
// Single source: every landing section's eyebrow → heading → lead reveal
// uses these constants so the page reads as one rhythm, not five copies.
//
// The illustrations used to hand-tune their own delays in seconds, which put
// them outside that rhythm and let them run for well over two seconds after
// the copy had already settled. They now count beats through
// useIllustrationReveal() instead, so the whole page shares one clock.

import { type RefObject } from 'react'
import { useInView, useReducedMotion } from '../ui'

export const LANDING_EASE = [0.2, 0.7, 0.2, 1] as const
export const LANDING_REVEAL_Y = 16
export const LANDING_REVEAL_DURATION = 0.55

// Illustration cascade. One beat per element in reading order; BASE holds the
// diagram back just long enough for its panel to have faded in first, so the
// figure doesn't start drawing itself inside a frame that isn't there yet.
export const LANDING_ILLUS_BASE = 0.15
export const LANDING_ILLUS_BEAT = 0.14
export const LANDING_ILLUS_FADE = 0.4
export const LANDING_ILLUS_DRAW = 0.5

type RevealProps = {
  initial?: { opacity: number; y: number }
  animate?: { opacity: number; y: number }
  transition?: { duration: number; delay: number; ease: typeof LANDING_EASE }
}

// Fire on mount. Used by Hero (no scroll wait — it's above the fold).
// Returns a factory so the caller invokes the hook once and then builds
// props for each child element at a delay offset.
export function useFadeUp(): (delay?: number) => RevealProps {
  const reduce = useReducedMotion()
  return (delay = 0) => {
    if (reduce) return {}
    return {
      initial: { opacity: 0, y: LANDING_REVEAL_Y },
      animate: { opacity: 1, y: 0 },
      transition: { duration: LANDING_REVEAL_DURATION, delay, ease: LANDING_EASE },
    }
  }
}

// Fire when the section enters the viewport. Used by every below-the-fold
// section. Pass the section's container ref; the hook returns a `reveal()`
// function that builds props for each child (eyebrow / heading / lead /
// concept block) at a delay offset.
export function useSectionReveal(
  ref: RefObject<HTMLElement | null>,
): (delay?: number) => RevealProps {
  const reduce = useReducedMotion()
  const inView = useInView(ref, { once: true, margin: '-15%' })
  return (delay = 0) => {
    if (reduce) return {}
    return {
      initial: { opacity: 0, y: LANDING_REVEAL_Y },
      animate: inView ? { opacity: 1, y: 0 } : { opacity: 0, y: LANDING_REVEAL_Y },
      transition: { duration: LANDING_REVEAL_DURATION, delay, ease: LANDING_EASE },
    }
  }
}

type IllustrationReveal = {
  // Opacity-only entrance for a diagram element (a chip, a label, a unit).
  fade: (beat: number) => Record<string, unknown>
  // Stroke that draws itself along its own path — for connectors, which read
  // as movement between the things they join.
  draw: (beat: number) => Record<string, unknown>
}

// Illustration cascade, driven off the SVG's own ref so a diagram only starts
// once it is actually on screen. Callers pass a beat index rather than a delay
// in seconds: the ordering is the thing worth expressing, and the pacing stays
// tunable from one place.
export function useIllustrationReveal(
  ref: RefObject<Element | null>,
): IllustrationReveal {
  const reduce = useReducedMotion()
  const inView = useInView(ref, { once: true, margin: '-15%' })
  const delayFor = (beat: number) => LANDING_ILLUS_BASE + beat * LANDING_ILLUS_BEAT

  return {
    fade: (beat) =>
      reduce
        ? {}
        : {
            initial: { opacity: 0 },
            animate: inView ? { opacity: 1 } : { opacity: 0 },
            transition: {
              duration: LANDING_ILLUS_FADE,
              delay: delayFor(beat),
              ease: 'easeOut' as const,
            },
          },
    draw: (beat) =>
      reduce
        ? {}
        : {
            initial: { pathLength: 0 },
            animate: inView ? { pathLength: 1 } : { pathLength: 0 },
            transition: {
              duration: LANDING_ILLUS_DRAW,
              delay: delayFor(beat),
              ease: 'easeInOut' as const,
            },
          },
  }
}
