import { Link } from 'react-router-dom'
import { Button, motion } from '../ui'
import { useFadeUp } from './motion'

export function Hero() {
  const fade = useFadeUp()

  return (
    <section className="lp-section lp-hero" aria-labelledby="lp-headline">
      <div className="lp-section-inner lp-hero-inner">
        <motion.span className="lp-eyebrow lp-eyebrow--chip" {...fade(0)}>
          <span className="lp-eyebrow-dot" aria-hidden="true" />
          Commitments protocol · open spec
        </motion.span>

        <motion.h1 id="lp-headline" className="lp-headline" {...fade(0.05)}>
          {/* The period lives inside the span so the phrase blocks as one unit
            * — see .lp-headline .lp-accent-word in landing.css. */}
          Promises that <span className="lp-accent-word">make themselves true.</span>
        </motion.h1>

        {/* No "promise" here. The headline above already owns the word, and
          * saying it twice more in three sentences made the whole block read
          * as one idea restated rather than as a claim followed by its
          * mechanism. This defines the product noun instead, then spends its
          * remaining two sentences on the two outcomes. */}
        <motion.p className="lp-subhead" {...fade(0.15)}>
          A commitment is an on-chain agreement with capital staked behind it.
          Do what you said and the stake comes back, with the yield it earned
          while it was locked. Break it and the stake is forfeited.
        </motion.p>

        <motion.div className="lp-cta-row" {...fade(0.25)}>
          <Button as={Link} to="/app" variant="primary" size="lg">
            Launch app
          </Button>
          <Button as={Link} to="/app/docs" variant="default" size="lg">
            Read the docs
          </Button>
        </motion.div>
      </div>
    </section>
  )
}
