import { useId } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import cx from 'classnames'
import { fadeUp, stagger } from '../../lib/motion'
import styles from './Controls.module.css'

interface PageHeaderProps {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}

/** Page title block used by every top-level page. */
export function PageHeader({ icon, title, subtitle, actions }: PageHeaderProps) {
  return (
    <motion.header className={styles.pageHeader} initial="hidden" animate="visible" variants={stagger(0.05)}>
      <div className={styles.pageHeaderText}>
        <motion.h1 variants={fadeUp} className={styles.pageTitle}>{icon}{title}</motion.h1>
        {subtitle && <motion.p variants={fadeUp} className={styles.pageSubtitle}>{subtitle}</motion.p>}
      </div>
      {actions && <motion.div variants={fadeUp} className={styles.pageActions}>{actions}</motion.div>}
    </motion.header>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
  count?: number | string
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  onChange: (value: T) => void
  options: SegmentOption<T>[]
}

/** Pill-shaped single choice (a radiogroup) with a sliding selection. */
export function Segmented<T extends string>({ label, value, onChange, options }: SegmentedProps<T>) {
  const layoutId = useId()
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={cx(styles.segment, active && styles.segmentActive)}
            onClick={() => onChange(opt.value)}
          >
            {active && <motion.span layoutId={layoutId} className={styles.segmentPill} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            {opt.icon && <span className={styles.segmentInner}>{opt.icon}</span>}
            <span className={styles.segmentInner}>{opt.label}</span>
            {opt.count !== undefined && <span className={cx(styles.segmentInner, styles.segmentCount)}>{opt.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

interface SearchFieldProps {
  /** Accessible name */
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/** Compact search input with a clear button. */
export function SearchField({ label, value, onChange, placeholder, className }: SearchFieldProps) {
  return (
    <label className={cx(styles.search, className)}>
      <Search size={15} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.stopPropagation(); onChange('') } }}
      />
      {value && (
        <button type="button" className={styles.searchClear} aria-label="Clear search" onClick={() => onChange('')}>
          <X size={14} />
        </button>
      )}
    </label>
  )
}
