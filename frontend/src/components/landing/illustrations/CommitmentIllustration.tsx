import { useRef } from 'react'
import { motion } from '../../ui'
import { useIllustrationReveal } from '../motion'

// "A commitment is a stake-backed promise."
//
// The primitive in its most simple form: a promise with stake locked
// beneath it, an arbiter who holds the call, and the two ways it resolves.
// The diagram is a circuit, not a tree — value leaves you, sits under the
// arbiter's judgement, and comes back bigger if you did what you said.
// That return leg is the whole point of the section, so it is the one line
// here that moves on its own.
//
// Two earlier passes got the yield wrong in the same way: they drew it as a
// property of the capital (a YIELD chip under the stake, then an EARNING
// loop returning into it). Both said "this money grows" without saying
// *when you get to keep it*. Yield is a payoff for keeping the promise, so
// it is drawn as a flow out of the KEPT outcome, running the length of the
// diagram back into your stake. Do not reattach it to the stake box.
//
// Kept is the lower branch and broken the upper one, which inverts the
// usual good-news-on-top convention on purpose. The return leg needs an
// unobstructed run back to the stake, the bottom of the frame is the only
// place with room for one, and the branches were never a sequence — they
// are alternatives (see the shared beats below). It also means the eye
// finishes on the reward rather than on the forfeit.
//
// Beats, not seconds — see landing/motion.ts. The two outcomes share beats
// 4.5/5 and 5.5/6 (offset by a half) because they are alternatives, not a
// sequence: staggering them fully would imply one happens after the other.
// The return leg lands last, at 6.5, once both outcomes are on screen and
// there is something to contrast it with.
//
// The return leg fades in rather than drawing itself along its path.
// `draw()` animates `pathLength`, which framer-motion implements by writing
// stroke-dasharray/dashoffset inline — that would trample the marching
// dashes in `.lp-illus-flow`. Fading it in and letting the march carry it
// costs the one-time reveal and buys a permanent one. (Same collision is
// why the branch paths' `strokeDasharray` never actually renders; they are
// solid in practice. Left alone here — the contrast is useful, since the
// only genuinely dashed line is the only one carrying value.)
//
// The viewBox is cropped to the drawing's measured bounds (getBBox reports
// x 20–319.3, y 34–184.5) plus ~8 units of margin on every side. The old
// `0 0 320 200` carried 34 units of dead space above the diagram and 20 to
// its left, so the plate rendered it as an off-centre figure adrift in its
// frame. Re-measure rather than eyeball if the labels ever change: the
// FORFEITED label sets the right edge and the return leg sets the bottom.
//
// All colours via tokens. SVG is a unit grid that scales to the container.

export function CommitmentIllustration() {
  const ref = useRef<SVGSVGElement>(null)
  const { fade, draw } = useIllustrationReveal(ref)

  return (
    <svg
      ref={ref}
      viewBox="12 26 315 166"
      width="100%"
      height="100%"
      role="img"
      aria-labelledby="commitment-illus-title commitment-illus-desc"
    >
      <title id="commitment-illus-title">A commitment in its simplest form</title>
      <desc id="commitment-illus-desc">
        A promise with stake locked beneath it. An arbiter judges the
        promise. If it is broken, the stake is forfeited. If it is kept, the
        stake flows back to you along with the yield it earned while it was
        locked.
      </desc>

      {/* Promise chip with the stake locked beneath it */}
      <motion.g {...fade(0)}>
        <rect x="20" y="40" width="72" height="22" className="lp-illus-stroke" fill="var(--surface)" />
        <text x="56" y="55" textAnchor="middle" className="lp-illus-label">
          PROMISE
        </text>
      </motion.g>
      <motion.g {...fade(1)}>
        <line x1="56" y1="62" x2="56" y2="74" className="lp-illus-stroke" />
        <rect
          x="28"
          y="74"
          width="56"
          height="48"
          className="lp-illus-stroke lp-illus-stroke--accent"
          strokeWidth={1.5}
          fill="var(--accent-soft)"
        />
        <text x="56" y="102" textAnchor="middle" className="lp-illus-label lp-illus-label--accent">
          STAKE
        </text>
      </motion.g>

      {/* The arbiter holds the call */}
      <motion.line x1="84" y1="98" x2="129" y2="98" className="lp-illus-stroke" {...draw(2.5)} />
      <motion.g {...fade(3.5)}>
        <circle cx="157" cy="98" r="28" className="lp-illus-stroke" fill="var(--surface)" />
        <text x="157" y="102" textAnchor="middle" className="lp-illus-label">
          ARBITER
        </text>
      </motion.g>

      {/* Outcome: promise broken — the stake is forfeited. The circuit ends
        * here; nothing flows back. Labels sit beside the marker rather than
        * under it so the bottom of the frame stays clear for the return
        * leg, and both outcomes are labelled the same way. */}
      <motion.path
        d="M180 80 Q200 52 220 46"
        className="lp-illus-stroke lp-illus-stroke--accent"
        strokeDasharray="3 3"
        fill="none"
        {...draw(4.5)}
      />
      <motion.g {...fade(5.5)}>
        <rect
          x="220"
          y="34"
          width="24"
          height="24"
          className="lp-illus-stroke lp-illus-stroke--accent"
          fill="var(--accent-soft)"
        />
        <line x1="220" y1="34" x2="244" y2="58" className="lp-illus-stroke lp-illus-stroke--accent" />
        <line x1="244" y1="34" x2="220" y2="58" className="lp-illus-stroke lp-illus-stroke--accent" />
        <text x="252" y="45" className="lp-illus-label lp-illus-label--accent">
          BROKEN
        </text>
        <text x="252" y="57" className="lp-illus-label lp-illus-label--accent">
          FORFEITED
        </text>
      </motion.g>

      {/* Outcome: promise kept — the marker is intact, and it is where the
        * return leg starts. Accent, like everything else on the capital
        * circuit: the stake, both outcomes, and the leg home. Muted is
        * reserved for the judgement layer (the promise and the arbiter).
        * Drawn neutral, this branch receded to near-invisible in light
        * theme while the forfeit dominated — the wrong emphasis for a
        * section whose argument is that keeping your word pays. */}
      <motion.path
        d="M180 116 Q200 144 220 150"
        className="lp-illus-stroke lp-illus-stroke--accent"
        strokeDasharray="3 3"
        fill="none"
        {...draw(5)}
      />
      <motion.g {...fade(6)}>
        <rect
          x="220"
          y="138"
          width="24"
          height="24"
          className="lp-illus-stroke lp-illus-stroke--accent"
          fill="var(--surface)"
        />
        <text x="252" y="149" className="lp-illus-label lp-illus-label--accent">
          KEPT
        </text>
        <text x="252" y="161" className="lp-illus-label lp-illus-label--accent">
          RETURNED
        </text>
      </motion.g>

      {/* The return leg: keep the promise and value flows back to you. Runs
        * out of the kept marker, along the floor of the diagram, and up
        * into the stake it came from — the arrowhead lands on the stake's
        * bottom edge (y=122) so the circuit visibly closes rather than
        * merely pointing home. Marching dashes carry the direction. */}
      <motion.g {...fade(6.5)}>
        <path
          d="M232 162 L232 176 Q232 184 224 184 L64 184 Q56 184 56 176 L56 128"
          className="lp-illus-stroke lp-illus-stroke--accent lp-illus-flow"
          fill="none"
        />
        <path d="M51 128 L56 122 L61 128" className="lp-illus-stroke lp-illus-stroke--accent" fill="none" />
        <text x="144" y="178" textAnchor="middle" className="lp-illus-label lp-illus-label--accent">
          STAKE + YIELD
        </text>
      </motion.g>
    </svg>
  )
}
