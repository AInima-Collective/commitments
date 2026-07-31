import { useRef } from 'react'
import { motion } from '../../ui'
import { useIllustrationReveal } from '../motion'

// "One promise is a bond. Many promises are a market."
//
// The same accent square that meant "stake" in the primitive section is
// reused here as the unit of composition, multiplying left to right:
// one commitment, a pair facing each other, a pooled cluster, a market.
// Elements enter once in reading order, then hold still.
//
// Beats, not seconds — see landing/motion.ts.
//
// Like the primitive diagram, the viewBox is cropped to the drawing's measured
// bounds (getBBox reports x 28.4–304, y 63–145.1) plus 8 units of margin. This
// one sat inside a `0 0 320 200` box with 63 units of dead space above it and
// 55 below, which is most of why the figure read as adrift in its panel.
//
// All colours via tokens. SVG is a unit grid that scales to the container.

const UNIT = 16

function Unit({ x, y }: { x: number; y: number }) {
  return (
    <rect
      x={x}
      y={y}
      width={UNIT}
      height={UNIT}
      className="lp-illus-stroke lp-illus-stroke--accent"
      strokeWidth={1.25}
      fill="var(--accent-soft)"
    />
  )
}

// 3×3 market grid, 20px pitch, top-left corner of the block.
//
// `beat` fills the grid diagonally rather than row by row: a market arrives
// as a wavefront, not as a list being read out. Nine cells at a quarter-beat
// apart span one beat total, so the whole cascade still lands on time.
const MARKET_UNITS = [0, 1, 2].flatMap((row) =>
  [0, 1, 2].map((col) => ({
    x: 248 + col * 20,
    y: 67 + row * 20,
    beat: 6 + (row + col) * 0.25,
  })),
)

export function ComposeIllustration() {
  const ref = useRef<SVGSVGElement>(null)
  const { fade, draw } = useIllustrationReveal(ref)

  return (
    <svg
      ref={ref}
      viewBox="20 55 292 98"
      width="100%"
      height="100%"
      role="img"
      aria-labelledby="compose-illus-title compose-illus-desc"
    >
      <title id="compose-illus-title">Commitments compose</title>
      <desc id="compose-illus-desc">
        One commitment multiplies left to right: a single stake, a pair
        facing each other, a pooled cluster sharing one circle, and a grid
        of many forming a market.
      </desc>

      {/* One commitment */}
      <motion.g {...fade(0)}>
        <Unit x={32} y={87} />
        <text x={40} y={142} textAnchor="middle" className="lp-illus-label">
          ONE
        </text>
      </motion.g>

      <motion.line x1="56" y1="95" x2="78" y2="95" className="lp-illus-stroke" strokeDasharray="3 3" {...draw(1)} />

      {/* Two facing each other */}
      <motion.g {...fade(2)}>
        <Unit x={86} y={87} />
        <line x1="102" y1="95" x2="114" y2="95" className="lp-illus-stroke" />
        <Unit x={114} y={87} />
        <text x={108} y={142} textAnchor="middle" className="lp-illus-label">
          PAIR
        </text>
      </motion.g>

      <motion.line x1="138" y1="95" x2="152" y2="95" className="lp-illus-stroke" strokeDasharray="3 3" {...draw(3)} />

      {/* A shared pool */}
      <motion.g {...fade(4)}>
        <circle cx="190" cy="95" r="32" className="lp-illus-stroke" strokeDasharray="3 3" fill="none" />
        <Unit x={171} y={76} />
        <Unit x={193} y={76} />
        <Unit x={171} y={98} />
        <Unit x={193} y={98} />
        <text x={190} y={142} textAnchor="middle" className="lp-illus-label">
          POOL
        </text>
      </motion.g>

      <motion.line x1="226" y1="95" x2="240" y2="95" className="lp-illus-stroke" strokeDasharray="3 3" {...draw(5)} />

      {/* Many form a market: the grid fills in as a diagonal wavefront */}
      {MARKET_UNITS.map((u, i) => (
        <motion.g key={i} {...fade(u.beat)}>
          <Unit x={u.x} y={u.y} />
        </motion.g>
      ))}
      <motion.g {...fade(6)}>
        <text x={276} y={142} textAnchor="middle" className="lp-illus-label lp-illus-label--accent">
          MARKET
        </text>
      </motion.g>
    </svg>
  )
}
