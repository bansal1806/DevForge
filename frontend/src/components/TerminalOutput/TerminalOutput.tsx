import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, Clock, Terminal, Trash2, X, XCircle } from 'lucide-react'
import type { ExecutionResult } from '../../lib/api'
import { spring } from '../../lib/motion'
import styles from './TerminalOutput.module.css'

const REVEAL_FRAMES = 36 // ~0.6s at 60fps, however long the output is

interface Segment {
  text: string
  className: string
}

/**
 * Prints segments in order like a terminal writing them out. Mount with a new
 * key to replay; reduced-motion users get the full text immediately.
 */
function Typewriter({ segments, onDone }: { segments: Segment[], onDone: () => void }) {
  const reduced = useReducedMotion()
  const total = segments.reduce((n, s) => n + s.text.length, 0)
  const [shown, setShown] = useState(reduced ? total : 0)
  const done = useRef(onDone)

  useEffect(() => {
    done.current = onDone
  })

  useEffect(() => {
    if (shown >= total) {
      done.current()
      return
    }
    const step = Math.max(1, Math.ceil(total / REVEAL_FRAMES))
    const frame = requestAnimationFrame(() => setShown((n) => Math.min(total, n + step)))
    return () => cancelAnimationFrame(frame)
  }, [shown, total])

  // Character offset where each segment starts in the combined stream
  const starts = segments.map((_, i) => segments.slice(0, i).reduce((n, s) => n + s.text.length, 0))
  return (
    <>
      {segments.map((segment, i) => {
        const visible = segment.text.slice(0, Math.max(0, shown - starts[i]))
        return visible ? <span key={i} className={segment.className}>{visible}</span> : null
      })}
    </>
  )
}

/** Keeps a scroll container pinned to the bottom as content grows, unless the user scrolled up. */
function useStickToBottom<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let pinned = true
    const onScroll = () => { pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 24 }
    const observer = new MutationObserver(() => { if (pinned) el.scrollTop = el.scrollHeight })
    el.addEventListener('scroll', onScroll)
    observer.observe(el, { childList: true, subtree: true, characterData: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [])
  return ref
}

function useElapsed(running: boolean) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!running) return
    const started = Date.now()
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 100)
    return () => {
      window.clearInterval(timer)
      setElapsed(0)
    }
  }, [running])
  return elapsed
}

interface TerminalOutputProps {
  fileName?: string
  running: boolean
  result: ExecutionResult | null
  /** Changes on every run, so the reveal animation replays */
  runId: number
  durationMs?: number | null
  onClear: () => void
  onClose: () => void
}

/** Terminal pane for code runs: heating bar while running, printed output, a status pill. */
export function TerminalOutput({ fileName, running, result, runId, durationMs, onClear, onClose }: TerminalOutputProps) {
  const elapsed = useElapsed(running)
  const bodyRef = useStickToBottom<HTMLDivElement>()
  const [printedRun, setPrintedRun] = useState(-1)

  const outcome = result ? (result.timedOut ? 'timeout' : result.exitCode === 0 ? 'ok' : 'fail') : null
  const printed = !!result && printedRun === runId

  const segments: Segment[] = result
    ? [
        ...(result.stdout ? [{ text: result.stdout, className: styles.stdout }] : []),
        ...(result.stderr ? [{ text: (result.stdout && !result.stdout.endsWith('\n') ? '\n' : '') + result.stderr, className: styles.stderr }] : []),
      ]
    : []

  return (
    <div className={styles.terminal}>
      <div className={styles.header}>
        <span className={styles.title}><Terminal size={13} /> Terminal</span>
        {fileName && <span className={styles.file}>{fileName}</span>}
        <span className={styles.spacer} />
        <button className={styles.headerButton} onClick={onClear} disabled={running}>
          <Trash2 size={12} /> Clear
        </button>
        <button className={styles.headerButton} onClick={onClose} aria-label="Close terminal">
          <X size={14} />
        </button>
      </div>

      <div ref={bodyRef} className={styles.body} aria-live="polite" aria-busy={running}>
        {running && <span className={styles.heatBar} aria-hidden="true" />}

        {running && (
          <div className={styles.running}>
            <span className={styles.prompt}>$</span> run {fileName}
            <span>· heating up… {(elapsed / 1000).toFixed(1)}s</span>
          </div>
        )}

        {!running && result && (
          <pre className={styles.output}>
            <span className={styles.prompt}>$ run {fileName}{'\n'}</span>
            <Typewriter key={runId} segments={segments} onDone={() => setPrintedRun(runId)} />
            {!printed && <span className={styles.caret} aria-hidden="true" />}
          </pre>
        )}

        {!running && printed && outcome && (
          <motion.div
            key={`status-${runId}`}
            className={`${styles.status} ${styles[outcome]}`}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={outcome === 'fail' ? { opacity: 1, scale: 1, x: [0, -6, 6, -4, 4, 0] } : { opacity: 1, scale: 1 }}
            transition={outcome === 'fail' ? { duration: 0.45 } : spring}
          >
            {outcome === 'ok' && <><CheckCircle2 size={13} /> Cooled · exit 0</>}
            {outcome === 'fail' && <><XCircle size={13} /> Failed · exit {result!.exitCode}</>}
            {outcome === 'timeout' && <><Clock size={13} /> Timed out</>}
            {durationMs != null && <span style={{ opacity: 0.75, fontWeight: 500 }}>· {(durationMs / 1000).toFixed(2)}s</span>}
          </motion.div>
        )}

        {!running && !result && (
          <div className={styles.empty}>Ready. Press Run (or use the command palette) to execute this file.</div>
        )}
      </div>
    </div>
  )
}
