import { useRef } from 'react'
import { motion, useInView, useReducedMotion, type Variants } from '../ui'
import { LANDING_EASE, useSectionReveal } from './motion'

type Application = {
  name: string
  blurb: string
}

// Sourced from use-cases/ and the protocol spec. Eight cards, one
// primitive — each blurb names the promise being staked and what breaking
// it costs, not the machinery underneath.
const APPS: Application[] = [
  {
    name: 'AI agent bonds',
    blurb: 'Agents stake capital behind their actions. An agent that misbehaves loses its bond, so trusting one stops being a leap of faith.',
  },
  {
    name: 'Insurance',
    blurb: 'Underwriters stake capital to back claims, like a floor under a vault’s value. If the loss happens, the payout is already funded.',
  },
  {
    name: 'Mutual coverage',
    blurb: 'Members pool commitments to share each other’s losses. Premiums stream to the capital standing behind the pool.',
  },
  {
    name: 'Validated services',
    blurb: 'Operators stake behind the work they do for a service. Misbehave and the stake is forfeited.',
  },
  {
    name: 'Bilateral DAO treaty',
    blurb: 'Two DAOs lock matching commitments to each other. Breaking the treaty costs the side that broke it.',
  },
  {
    name: 'Fundraising',
    blurb: 'Backers commit funds that only move if the goal is met. Fall short and every stake unlocks, untouched.',
  },
  {
    name: 'Compute market',
    blurb: 'Providers stake behind the compute they sell, so bad or missing results cost them. Buyers get a guarantee instead of best effort.',
  },
  {
    name: 'SLAs',
    blurb: 'Providers post bonds behind their uptime promises. Miss the SLA and the bond pays the customer.',
  },
]

export function ApplicationsSection() {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const reveal = useSectionReveal(ref)
  const inView = useInView(ref, { once: true, margin: '-10%' })

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: reduce ? 0 : 0.06 },
    },
  }
  const itemVariants: Variants = reduce
    ? { hidden: {}, visible: {} }
    : {
        hidden: { opacity: 0, y: 12 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.45, ease: LANDING_EASE },
        },
      }

  return (
    <section
      className="lp-section"
      aria-labelledby="lp-apps-heading"
    >
      <div className="lp-section-inner" ref={ref}>
        <motion.div className="lp-eyebrow" {...reveal(0)}>
          What you can build
        </motion.div>
        <motion.h2 id="lp-apps-heading" className="lp-section-heading" {...reveal(0.05)}>
          One primitive. Many uses.
        </motion.h2>
        <motion.p className="lp-section-lead" {...reveal(0.1)}>
          Different promises, same machinery underneath: stake locked behind
          an obligation, with a real cost for breaking it. Eight applications
          of one primitive.
        </motion.p>

        <motion.ul
          className="lp-app-grid"
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {APPS.map((app, i) => (
            <motion.li key={app.name} className="lp-app-card" variants={itemVariants}>
              <span className="lp-app-card-index" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="lp-app-card-name">{app.name}</span>
              <p className="lp-app-card-blurb">{app.blurb}</p>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  )
}
