interface SpinnerProps {
  size?: number
  /** Announced to screen readers */
  label?: string
  className?: string
}

/** An ember arc that spins (static under reduced motion). */
export function Spinner({ size = 18, label = 'Loading', className }: SpinnerProps) {
  return (
    <span role="status" className={className} style={{ display: 'inline-flex', lineHeight: 0 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  )
}
