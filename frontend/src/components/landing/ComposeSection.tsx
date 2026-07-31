import { useRef } from 'react'
import { motion } from '../ui'
import { ComposeIllustration } from './illustrations/ComposeIllustration'
import { useSectionReveal } from './motion'

const POINTS: Array<{ n: string; body: React.ReactNode }> = [
  {
    n: '01',
    body: (
      <span>
        <strong>Pair them.</strong> Two commitments facing each other are a
        bilateral agreement: both sides stake, one arbiter judges, a breach
        settles against whoever broke it.
      </span>
    ),
  },
  {
    n: '02',
    body: (
      <span>
        <strong>Pool them.</strong> Many commitments backing the same risk
        are mutual coverage: members share losses, premiums stream to the
        capital behind them.
      </span>
    ),
  },
  {
    n: '03',
    body: (
      <span>
        <strong>Aggregate them.</strong> Commitments across different tokens
        roll up into one weighted score: governance voting power, or
        service-wide stake.
      </span>
    ),
  },
]

export function ComposeSection() {
  const ref = useRef<HTMLDivElement>(null)
  const reveal = useSectionReveal(ref)

  return (
    <section className="lp-section" aria-labelledby="lp-compose-heading">
      <div className="lp-section-inner" ref={ref}>
        <motion.div className="lp-eyebrow" {...reveal(0)}>
          Stack and combine
        </motion.div>
        <motion.h2
          id="lp-compose-heading"
          className="lp-section-heading"
          {...reveal(0.05)}
        >
          One promise is a bond. Many promises are a market.
        </motion.h2>
        {/* Deliberately does not preview the three points below it. The
          * earlier lead listed pair / pool / aggregate and the list then
          * repeated all three verbatim. */}
        <motion.p className="lp-section-lead" {...reveal(0.1)}>
          Every commitment has the same shape, so they compose. One primitive
          carries a handshake between two parties and an entire insurance
          market.
        </motion.p>

        <div className="lp-concept">
          <motion.div className="lp-concept-body" {...reveal(0.15)}>
            <ol className="lp-concept-points">
              {POINTS.map((p) => (
                <li key={p.n} className="lp-concept-point">
                  <span className="lp-concept-point-num">{p.n}</span>
                  <span>{p.body}</span>
                </li>
              ))}
            </ol>
            <div className="lp-pull-quote">
              A commitment can be the input to a bigger commitment, all the
              way up.
            </div>
          </motion.div>

          <motion.figure className="lp-concept-illus" {...reveal(0.2)}>
            <div className="lp-concept-illus-plate">
              <ComposeIllustration />
            </div>
            <figcaption className="lp-concept-illus-caption">
              The same primitive at every scale
            </figcaption>
          </motion.figure>
        </div>
      </div>
    </section>
  )
}
