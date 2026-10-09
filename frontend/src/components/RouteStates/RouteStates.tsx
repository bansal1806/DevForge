import { Component, useEffect, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, EmptyState, LinkButton, Skeleton, Spinner } from '../ui'
import styles from './RouteStates.module.css'

/** Delay before a loading state appears, so fast loads don't flash. */
const SHOW_AFTER_MS = 180

function useDelayed() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [])
  return visible
}

/** Skeleton shown inside the app shell while a page's code loads. */
export function PageFallback() {
  const visible = useDelayed()
  if (!visible) return null
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading page">
      <Skeleton width={240} height={34} />
      <Skeleton width={360} height={16} />
      <div className={styles.grid}>
        {[0, 1, 2].map((i) => <Skeleton key={i} height={120} radius="var(--radius-lg)" />)}
      </div>
      <Skeleton height={220} radius="var(--radius-lg)" />
    </div>
  )
}

/** Full-screen loader for routes outside the shell (auth, 404, style guide). */
export function ScreenFallback({ label = 'Loading…' }: { label?: string }) {
  const visible = useDelayed()
  if (!visible) return null
  return (
    <div className={styles.screen}>
      <Spinner size={28} label={label} />
      <span aria-hidden="true">{label}</span>
    </div>
  )
}

interface BoundaryProps {
  children: ReactNode
  /** Change this (e.g. the pathname) to clear a caught error */
  resetKey: string
}

interface BoundaryState { error: Error | null, resetKey: string }

/** Catches render errors in a page so the shell (nav, sidebar) keeps working. */
export class RouteErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState) {
    // Navigating elsewhere clears the error
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className={styles.page}>
        <EmptyState
          title="This page hit a snag"
          description="Something went wrong while rendering it. Reloading usually fixes it — if not, head back to the dashboard."
          action={
            <div className={styles.actions}>
              <Button variant="primary" size="sm" iconLeft={<RefreshCw size={14} />} onClick={() => window.location.reload()}>Reload</Button>
              <LinkButton to="/dashboard" variant="secondary" size="sm">Dashboard</LinkButton>
            </div>
          }
        />
      </div>
    )
  }
}
