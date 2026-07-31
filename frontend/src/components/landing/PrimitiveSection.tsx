import { motion } from '../ui'
import { useRef } from 'react'
import { CommitmentIllustration } from './illustrations/CommitmentIllustration'
import { useSectionReveal } from './motion'

const POINTS: Array<{ n: string; body: React.ReactNode }> = [
  {
    n: '01',
    body: (
      <span>
        <strong>Stake capital.</strong> The protocol holds it until the
        commitment resolves, and it keeps earning the whole time. Keep your
        word and you get it all back, yield included.
      </span>
    ),
  },
  {
    n: '02',
    body: (
      <span>
        <strong>Name an arbiter.</strong> Whoever you both trust to judge it:
        a contract, an oracle, a multisig, the counterparty.
      </span>
    ),
  },
  {
    n: '03',
    body: (
      <span>
        <strong>Breaking it costs.</strong> The arbiter can seize the stake.
        Every seizure waits out a challenge window of at least a day, so a
        wrong call can be disputed.
      </span>
    ),
  },
]

export function PrimitiveSection() {
  const ref = useRef<HTMLDivElement>(null)
  const reveal = useSectionReveal(ref)

  return (
    <section className="lp-section" aria-labelledby="lp-primitive-heading">
      <div className="lp-section-inner" ref={ref}>
        <motion.div className="lp-eyebrow" {...reveal(0)}>
          The primitive
        </motion.div>
        <motion.h2 id="lp-primitive-heading" className="lp-section-heading" {...reveal(0.05)}>
          A commitment is a stake-backed promise.
        </motion.h2>
        <motion.p className="lp-section-lead" {...reveal(0.1)}>
          You put capital behind your word. Whoever you promised gets recourse
          without a trusted intermediary: a protocol, a service, another
          person, an AI agent.
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
              Promises become credible because breaking them carries a
              priced, enforceable cost.
            </div>
          </motion.div>

          {/* figure/figcaption, not div/span: the caption names the diagram,
            * and the plate wrapper gives the SVG its own ruled cell so the
            * caption can sit on the frame rather than float inside it. */}
          <motion.figure className="lp-concept-illus" {...reveal(0.2)}>
            <div className="lp-concept-illus-plate">
              <CommitmentIllustration />
            </div>
            {/* The diagram already labels KEPT · RETURNED and BROKEN ·
              * FORFEITED, so the caption names the shape instead of reading
              * the labels back out. */}
            <figcaption className="lp-concept-illus-caption">
              One promise · one arbiter · two outcomes
            </figcaption>
          </motion.figure>
        </div>
      </div>
    </section>
  )
}
