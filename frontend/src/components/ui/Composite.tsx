import cx from 'classnames'
import { cloneElement, isValidElement, useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactElement, ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import type { ThemePreference } from '../../contexts/ThemeContext'
import { spring } from '../../lib/motion'
import styles from './Composite.module.css'

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */
export interface TabItem {
  id: string
  label: ReactNode
  icon?: ReactNode
  count?: number
}

interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (id: string) => void
  /** Accessible name for the tab list */
  label: string
  className?: string
}

/** Tab bar with an animated molten underline and arrow-key navigation. */
export function Tabs({ items, value, onChange, label, className }: TabsProps) {
  const groupId = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = items.length - 1
    const next =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null
    if (next === null) return
    e.preventDefault()
    refs.current[next]?.focus()
    onChange(items[next].id)
  }

  return (
    <div role="tablist" aria-label={label} className={cx(styles.tabList, className)}>
      {items.map((item, i) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            ref={(el) => { refs.current[i] = el }}
            role="tab"
            id={`${groupId}-${item.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={cx(styles.tab, active && styles.tabActive)}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && item.count > 0 && <span className={styles.tabCount}>{item.count}</span>}
            {active && <motion.span layoutId={`${groupId}-indicator`} className={styles.tabIndicator} transition={spring} />}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */
interface TooltipProps {
  content: ReactNode
  children: ReactElement<{ 'aria-describedby'?: string }>
}

/** Small label shown on hover and keyboard focus. */
export function Tooltip({ content, children }: TooltipProps) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const show = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setVisible(true), 250)
  }
  const hide = () => {
    window.clearTimeout(timer.current)
    setVisible(false)
  }

  return (
    <span className={styles.tooltipWrap} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {isValidElement(children) ? cloneElement(children, { 'aria-describedby': visible ? id : undefined }) : children}
      <AnimatePresence>
        {visible && (
          <motion.span
            id={id}
            role="tooltip"
            className={styles.tooltip}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2 }}
            transition={{ duration: 0.12 }}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */
// Warm, readable backgrounds for initials (white text passes AA on each)
const AVATAR_COLORS = ['#b8400f', '#9a3412', '#7c2d12', '#6d45d6', '#0f766e', '#1d4ed8', '#9d174d', '#4d5b6b']

function colorFor(seed: string) {
  let hash = 0
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

interface AvatarProps {
  name?: string | null
  src?: string | null
  size?: number
  /** Pulsing ember ring for "here right now" */
  live?: boolean
  className?: string
}

export function Avatar({ name, src, size = 32, live, className }: AvatarProps) {
  const [broken, setBroken] = useState(false)
  const label = name || 'Unknown user'
  const initials = label.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <span
      className={cx(styles.avatar, live && styles.live, className)}
      style={{ '--size': `${size}px`, '--avatar-bg': colorFor(label) } as CSSProperties}
      role="img"
      aria-label={live ? `${label} (online)` : label}
      title={label}
    >
      {src && !broken ? <img src={src} alt="" onError={() => setBroken(true)} /> : initials}
    </span>
  )
}

interface AvatarStackProps {
  people: { id: string, name?: string | null, src?: string | null, live?: boolean }[]
  max?: number
  size?: number
}

export function AvatarStack({ people, max = 4, size = 28 }: AvatarStackProps) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <span className={styles.stack}>
      {shown.map((p) => <Avatar key={p.id} name={p.name} src={p.src} live={p.live} size={size} />)}
      {extra > 0 && (
        <span className={cx(styles.avatar, styles.stackMore)} style={{ '--size': `${size}px` } as CSSProperties} aria-label={`${extra} more`}>
          +{extra}
        </span>
      )}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* EmptyState                                                          */
/* ------------------------------------------------------------------ */
/** A small anvil with drifting sparks — the default empty-state art. */
export function AnvilArt({ size = 88 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 96 72" fill="none" aria-hidden="true">
      <path d="M14 22h52c0 9 7 14 18 14v4H62l-6 12h10v8H30v-8h10l-6-12H22c-6 0-8-6-8-11v-7z"
        fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle className={styles.spark} cx="44" cy="12" r="2.2" fill="var(--color-ember)" />
      <circle className={styles.spark} cx="54" cy="8" r="1.6" fill="var(--color-warning)" />
      <circle className={styles.spark} cx="36" cy="6" r="1.4" fill="var(--color-ember-strong)" />
    </svg>
  )
}

interface EmptyStateProps {
  title: ReactNode
  description?: ReactNode
  art?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, art, action, className }: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, className)}>
      <div className={styles.emptyArt}>{art ?? <AnvilArt />}</div>
      <h3 className={styles.emptyTitle}>{title}</h3>
      {description && <p className={styles.emptyText}>{description}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Theme toggle                                                        */
/* ------------------------------------------------------------------ */
const THEME_OPTIONS: { value: ThemePreference, label: string, icon: ReactNode }[] = [
  { value: 'system', label: 'System', icon: <Monitor size={14} /> },
  { value: 'dark', label: 'Night', icon: <Moon size={14} /> },
  { value: 'light', label: 'Day', icon: <Sun size={14} /> },
]

export function ThemeToggle({ showLabels = true }: { showLabels?: boolean }) {
  const { preference, setPreference } = useTheme()
  const id = useId()

  return (
    <div role="radiogroup" aria-label="Color theme" className={styles.segmented}>
      {THEME_OPTIONS.map((opt) => {
        const active = preference === opt.value
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            title={opt.label}
            className={cx(styles.segment, active && styles.segmentActive)}
            onClick={() => setPreference(opt.value)}
          >
            {active && <motion.span layoutId={`${id}-thumb`} className={styles.segmentThumb} transition={spring} />}
            {opt.icon}
            {showLabels && <span className={styles.segmentLabel} aria-hidden="true">{opt.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
