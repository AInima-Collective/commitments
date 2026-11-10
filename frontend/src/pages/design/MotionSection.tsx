import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Button,
  SourceBlock,
  motion,
  useInView,
  useReducedMotion,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

function MotionShowcase() {
  const reduce = useReducedMotion()
  const fadeRef = useRef<HTMLDivElement>(null)
  const fadeInView = useInView(fadeRef, { once: false, margin: '-10%' })
  const [stagger, setStagger] = useState(0)

  return (
    <div className="ds-stack ds-stack-6">
      {/* 1. fade-in-on-scroll */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">1 · fade-in-on-scroll</div>
        <div
          ref={fadeRef}
          style={{
            border: '1px solid var(--border)',
            padding: 'var(--space-6)',
            background: 'var(--surface)',
            minHeight: 96,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={
              reduce
                ? { opacity: 1, y: 0 }
                : fadeInView
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: 16 }
            }
            transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}
            className="ds-mono"
          >
            Element fades + rises into view as the container crosses the
            viewport threshold. Re-triggered here so you can scroll it past.
          </motion.div>
        </div>
        <div className="ds-text-xs ds-subtle">
          Production usage sets <code>once: true</code> so the motion is
          single-shot. This demo passes <code>once: false</code> for visibility.
        </div>
      </div>

      {/* 2. staggered list */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">2 · staggered list</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <Button size="sm" onClick={() => setStagger((n) => n + 1)}>
            Replay
          </Button>
          <span className="ds-text-xs ds-subtle">
            Children animate with a {reduce ? '0s' : '60ms'} delay between each
          </span>
        </div>
        <motion.ul
          key={stagger}
          variants={{
            hidden: {},
            visible: {
              transition: { staggerChildren: reduce ? 0 : 0.06 },
            },
          }}
          initial="hidden"
          animate="visible"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 'var(--space-2)',
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <motion.li
              key={i}
              variants={
                reduce
                  ? { hidden: {}, visible: {} }
                  : {
                      hidden: { opacity: 0, y: 12 },
                      visible: {
                        opacity: 1,
                        y: 0,
                        transition: { duration: 0.45, ease: [0.2, 0.7, 0.2, 1] },
                      },
                    }
              }
              style={{
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                padding: 'var(--space-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)',
                textAlign: 'center',
              }}
            >
              item · {String(i + 1).padStart(2, '0')}
            </motion.li>
          ))}
        </motion.ul>
      </div>

      {/* 3. ambient loop */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">3 · ambient loop</div>
        <div
          style={{
            border: '1px solid var(--border)',
            padding: 'var(--space-6)',
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 96,
          }}
        >
          <svg viewBox="0 0 200 60" width="240" height="60">
            <motion.rect
              x={4}
              y={20}
              width={20}
              height={20}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth={1}
              animate={reduce ? undefined : { opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.rect
              x={36}
              y={20}
              width={20}
              height={20}
              fill="var(--accent-soft)"
              stroke="var(--accent)"
              strokeWidth={1.5}
              animate={reduce ? undefined : { opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.path
              d="M64 30 L120 30"
              stroke="var(--accent)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              animate={reduce ? undefined : { strokeDashoffset: [0, -16] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
              fill="none"
            />
            <motion.circle
              cx={148}
              cy={30}
              r={14}
              fill="var(--surface)"
              stroke="var(--accent)"
              strokeWidth={1.5}
              animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              style={{ transformOrigin: '148px 30px', transformBox: 'fill-box' }}
            />
          </svg>
        </div>
        <div className="ds-text-xs ds-subtle">
          Use sparingly — only on dedicated teaching surfaces (landing, onboarding). The app shell stays still.
        </div>
      </div>
    </div>
  )
}

const SRC_MOTION =
  `import { motion, useReducedMotion, useInView } from '../components/ui'

// 1. fade-in-on-scroll
const reduce = useReducedMotion()
const ref = useRef<HTMLDivElement>(null)
const inView = useInView(ref, { once: true, margin: '-15%' })
<motion.div
  ref={ref}
  initial={reduce ? false : { opacity: 0, y: 16 }}
  animate={inView ? { opacity: 1, y: 0 } : undefined}
  transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}
/>

// 2. staggered list — parent variants drive child variants
<motion.ul variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
           initial="hidden" animate="visible">
  {items.map(i => <motion.li key={i} variants={item} />)}
</motion.ul>

// 3. ambient loop
<motion.rect animate={{ opacity: [0.5, 1, 0.5] }}
             transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} />`

export function MotionSection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="motion"
        title="Motion"
        lead="The system is mostly static — fast (120ms) feedback on interaction, no decorative motion in the app shell. Pages that need to teach (the landing route at /, future onboarding) reach for framer-motion through the components/ui barrel. Three patterns cover everything we ship: fade-in-on-scroll, staggered list, ambient loop. All three respect useReducedMotion."
      />

      <MotionShowcase />

      <div className="ds-stack ds-stack-3">
        <div className="ds-label">contract</div>
        <ul className="ds-text-sm ds-stack ds-stack-2" style={{ paddingLeft: 'var(--space-4)' }}>
          <li>
            Import <code>motion</code>, <code>useReducedMotion</code>, <code>useInView</code> from
            <code> ../components/ui</code> — never deep-import from
            <code> framer-motion</code> directly.
          </li>
          <li>
            Always read <code>useReducedMotion()</code>. When true, omit <code>animate</code>/<code>transition</code> props or set them to <code>false</code> — never paper over with shorter durations.
          </li>
          <li>
            Use <code>useInView(ref, &#123; once: true, margin: '-15%' &#125;)</code> for scroll triggers so motion is single-shot, not retriggered on re-entry.
          </li>
          <li>
            Default ease <code>[0.2, 0.7, 0.2, 1]</code> at 0.45–0.65s for entrances. Looped ambients use <code>'easeInOut'</code> at 1.6–2.4s.
          </li>
        </ul>
      </div>

      <div className="ds-text-xs ds-subtle">
        See <Link to="/">the landing page</Link> for the live composition — hero entrance, two scroll-revealed concept sections, staggered application grid, and the ambient share-field behind the headline.
      </div>

      <SourceBlock label="example" source={SRC_MOTION} />
    </section>
  )
}
