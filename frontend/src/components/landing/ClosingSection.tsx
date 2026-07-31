import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { Button, motion } from '../ui'
import { useSectionReveal } from './motion'

export function ClosingSection() {
  const ref = useRef<HTMLDivElement>(null)
  const reveal = useSectionReveal(ref)

  return (
    <section
      className="lp-section lp-closing"
      aria-labelledby="lp-closing-heading"
    >
      <div className="lp-section-inner lp-closing-inner" ref={ref}>
        <motion.div className="lp-eyebrow" {...reveal(0)}>
          Why it matters
        </motion.div>
        <motion.h2
          id="lp-closing-heading"
          className="lp-closing-heading"
          {...reveal(0.05)}
        >
          Promises become <span className="lp-accent-word">primitives</span>.
        </motion.h2>
        <motion.p className="lp-closing-lead" {...reveal(0.1)}>
          On-chain ownership built markets. On-chain identity built governance.
          On-chain enforceable agreements come next, and they look the same
          whether you call them validated services, insurance, treaties, or stake.
        </motion.p>

        <motion.div className="lp-cta-row" {...reveal(0.15)}>
          <Button as={Link} to="/app/docs/protocol" variant="primary" size="lg">
            Read the protocol docs
          </Button>
          <Button as={Link} to="/app" variant="default" size="lg">
            Launch app
          </Button>
        </motion.div>
      </div>
    </section>
  )
}
