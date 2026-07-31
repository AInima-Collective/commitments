// Motion vocabulary for the dapp.
//
// Re-exports the slice of framer-motion we use so feature folders go through
// `components/ui` like any other primitive (no deep imports). The intent is
// to keep one centralised place where we can swap or wrap motion primitives
// without rippling import sites across the app.
//
// Patterns documented on `/design` § Motion:
//   - fade-in-on-scroll  : `motion.div initial={{opacity:0,y:8}} whileInView animate`
//   - staggered list     : `motion.ul variants` + `motion.li variants`
//   - ambient loop       : `motion.* animate={{...}} transition={{repeat:Infinity}}`
//
// Reduced-motion handling is per-call — wrap with `useReducedMotion()` and
// drop the `animate` props when true. See `LandingShell.tsx` for the wiring.

export {
  motion,
  AnimatePresence,
  useReducedMotion,
  useInView,
  useMotionValue,
  useTransform,
  type Variants,
  type Transition,
  type MotionProps,
} from 'framer-motion'
