import cx from 'classnames'
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import styles from './Primitives.module.css'

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg'
  /** Hover lift + ember edge, for clickable cards */
  interactive?: boolean
}

export function Card({ padding = 'md', interactive, className, ...rest }: CardProps) {
  const pad = { none: undefined, sm: styles.padSm, md: styles.padMd, lg: styles.padLg }[padding]
  return <div className={cx(styles.card, pad, interactive && styles.interactive, className)} {...rest} />
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */
export type BadgeTone = 'neutral' | 'ember' | 'success' | 'danger' | 'warning' | 'info' | 'steel'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  /** Leading status dot */
  dot?: boolean
  icon?: ReactNode
}

export function Badge({ tone = 'neutral', dot, icon, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], className)} {...rest}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {icon}
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Kbd                                                                 */
/* ------------------------------------------------------------------ */
export function Kbd({ children, className }: { children: ReactNode, className?: string }) {
  return <kbd className={cx(styles.kbd, className)}>{children}</kbd>
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */
interface SkeletonProps {
  width?: CSSProperties['width']
  height?: CSSProperties['height']
  radius?: CSSProperties['borderRadius']
  className?: string
}

/** Placeholder shape shown while content loads (shimmer stops under reduced motion). */
export function Skeleton({ width = '100%', height = 14, radius, className }: SkeletonProps) {
  return <span aria-hidden="true" className={cx(styles.skeleton, className)} style={{ width, height, borderRadius: radius }} />
}

export function SkeletonText({ lines = 3, className }: { lines?: number, className?: string }) {
  return (
    <span className={cx(styles.skeletonText, className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '62%' : '100%'} />
      ))}
    </span>
  )
}
