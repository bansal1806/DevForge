import type { Transition, Variants } from 'framer-motion'

/**
 * Shared motion presets so the whole app moves with one personality:
 * quick, confident ease-outs for UI feedback, a soft spring for anything
 * that "lands". Reduced-motion users get opacity-only transitions via the
 * <MotionConfig reducedMotion="user"> wrapper in main.tsx.
 */

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const DURATION = {
  fast: 0.15,
  base: 0.22,
  slow: 0.42,
} as const

export const spring: Transition = { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }
export const softSpring: Transition = { type: 'spring', stiffness: 260, damping: 26 }

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_OUT } },
  exit: { opacity: 0, y: 8, transition: { duration: DURATION.fast, ease: EASE_OUT } },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.97, transition: { duration: DURATION.fast, ease: EASE_OUT } },
}

export const stagger = (step = 0.05, delay = 0): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: step, delayChildren: delay } },
})

/** Press feedback for clickable surfaces */
export const press = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.97 },
  transition: spring,
}
