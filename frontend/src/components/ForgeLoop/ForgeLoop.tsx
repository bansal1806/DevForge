import cx from 'classnames'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, GitCommitHorizontal, GitMerge, GitPullRequest, Sparkles } from 'lucide-react'
import { Badge } from '../ui'
import { sparkBurst } from '../../lib/sparks'
import { EASE_OUT, spring } from '../../lib/motion'
import styles from './ForgeLoop.module.css'

const STEPS = [
  { label: 'Write', ms: 3400 },
  { label: 'Commit', ms: 2600 },
  { label: 'Review', ms: 3200 },
  { label: 'Merge', ms: 3000 },
] as const

/* Syntax-highlighted lines of the demo edit (memoizing fibonacci) */
const CODE: ReactNode[] = [
  <><span className={styles.kw}>from</span> functools <span className={styles.kw}>import</span> lru_cache</>,
  <>{' '}</>,
  <><span className={styles.dec}>@lru_cache</span>(maxsize=<span className={styles.kw}>None</span>)</>,
  <><span className={styles.kw}>def</span> <span className={styles.fn}>fib</span>(n):</>,
  <>{'    '}<span className={styles.kw}>if</span> n {'<='} 1:</>,
  <>{'        '}<span className={styles.kw}>return</span> n</>,
  <>{'    '}<span className={styles.kw}>return</span> fib(n - 1) + fib(n - 2)</>,
  <>{' '}</>,
  <><span className={styles.fn}>print</span>(fib(<span className={styles.str}>80</span>))  <span className={styles.ln} style={{ width: 'auto' }}># instant</span></>,
]
const NEW_LINES = new Set([0, 2])

function useTimeout(fn: () => void, ms: number, enabled = true) {
  const latest = useRef(fn)
  useEffect(() => { latest.current = fn })
  useEffect(() => {
    if (!enabled) return
    const t = window.setTimeout(() => latest.current(), ms)
    return () => window.clearTimeout(t)
  }, [ms, enabled])
}

function WritePanel() {
  const reduced = useReducedMotion()
  const [lines, setLines] = useState(reduced ? CODE.length : 0)

  useEffect(() => {
    if (lines >= CODE.length) return
    const t = window.setTimeout(() => setLines((n) => n + 1), lines === 0 ? 250 : 300)
    return () => window.clearTimeout(t)
  }, [lines])

  return (
    <pre className={styles.code} aria-label="Editing fibonacci.py">
      {CODE.slice(0, lines).map((line, i) => (
        <motion.span
          key={i}
          className={NEW_LINES.has(i) ? styles.added : undefined}
          style={{ display: 'block' }}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
        >
          <span className={styles.ln}>{i + 1}</span>{line}
        </motion.span>
      ))}
      {lines < CODE.length && <span className={styles.caret} aria-hidden="true" />}
    </pre>
  )
}

function Rail({ hot, merged }: { hot: boolean, merged?: boolean }) {
  return (
    <div className={styles.rail} aria-hidden="true">
      <span className={styles.railNode} />
      <span className={styles.railLine} />
      <span className={styles.railNode} />
      <span className={styles.railLine} />
      <AnimatePresence>
        {hot && (
          <motion.span
            className={cx(styles.railNode, merged ? styles.railNodeMerge : styles.railNodeHot)}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={spring}
          />
        )}
      </AnimatePresence>
      <span className={styles.railLabel}>{merged ? 'merged into main' : hot ? 'committed just now' : 'feature/memoized-fib'}</span>
    </div>
  )
}

function CommitPanel({ live }: { live: boolean }) {
  const button = useRef<HTMLSpanElement>(null)
  const [committed, setCommitted] = useState(!live)

  useTimeout(() => {
    setCommitted(true)
    sparkBurst(button.current, { count: 30, power: 7 })
  }, 900, live)

  return (
    <>
      <pre className={styles.code} style={{ flex: 'none', opacity: 0.55 }}>
        {CODE.slice(2, 5).map((line, i) => (
          <span key={i} style={{ display: 'block' }}><span className={styles.ln}>{i + 3}</span>{line}</span>
        ))}
      </pre>
      <div className={styles.commitBar}>
        <GitCommitHorizontal size={16} color="var(--color-text-muted)" />
        <span className={styles.commitInput}>Memoize fibonacci with lru_cache</span>
        <motion.span
          ref={button}
          className={styles.fakeButton}
          animate={committed ? { scale: [1, 0.92, 1] } : {}}
          transition={{ duration: 0.25 }}
        >
          <GitCommitHorizontal size={13} /> {committed ? 'Committed' : 'Commit'}
        </motion.span>
      </div>
      <Rail hot={committed} />
    </>
  )
}

function ReviewPanel() {
  const reduced = useReducedMotion()
  const [reviewed, setReviewed] = useState(!!reduced)
  useTimeout(() => setReviewed(true), 1300, !reduced)

  const diff: [string, 'ctx' | 'plus' | 'minus'][] = [
    ['+ from functools import lru_cache', 'plus'],
    ['  ', 'ctx'],
    ['+ @lru_cache(maxsize=None)', 'plus'],
    ['  def fib(n):', 'ctx'],
    ['      if n <= 1:', 'ctx'],
  ]

  return (
    <>
      <div className={styles.prHead}>
        <GitPullRequest size={18} color="var(--color-success)" />
        <span className={styles.prTitle}>Memoize fibonacci</span>
        <Badge tone="success" dot>open</Badge>
      </div>
      <div className={styles.diff}>
        <div className={styles.diffFile}><span>fibonacci.py</span><span><span style={{ color: 'var(--color-success)' }}>+2</span> −0</span></div>
        {diff.map(([text, kind], i) => (
          <motion.div
            key={i}
            className={cx(styles.diffLine, styles[kind])}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.12 * i, duration: 0.2 }}
          >
            {text}
          </motion.div>
        ))}
      </div>
      <AnimatePresence>
        {reviewed && (
          <motion.div className={styles.review} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
            <Sparkles size={16} color="var(--color-violet)" style={{ flex: 'none', marginTop: 2 }} />
            <span><strong style={{ color: 'var(--color-text)' }}>AI review:</strong> exponential recursion becomes linear. No issues found — approve.</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function MergePanel({ live }: { live: boolean }) {
  const icon = useRef<HTMLSpanElement>(null)
  const [merged, setMerged] = useState(!live)

  useTimeout(() => {
    setMerged(true)
    sparkBurst(icon.current, { count: 60, power: 9, spread: 220 })
    window.setTimeout(() => sparkBurst(icon.current, { count: 30, power: 6 }), 160)
  }, 1000, live)

  return (
    <>
      <div className={styles.prHead}>
        <GitPullRequest size={18} color={merged ? 'var(--color-violet)' : 'var(--color-success)'} />
        <span className={styles.prTitle}>Memoize fibonacci</span>
        <Badge tone={merged ? 'info' : 'success'} dot>{merged ? 'merged' : 'open'}</Badge>
      </div>
      <Rail hot merged={merged} />
      <div className={styles.mergeBox}>
        <span ref={icon} className={cx(styles.mergeIcon, merged ? styles.mergeDone : styles.mergeReady)}>
          {merged ? <GitMerge size={20} /> : <CheckCircle2 size={20} />}
        </span>
        <div className={styles.mergeText}>
          <strong>{merged ? 'Merged into main' : 'No conflicts — ready to merge'}</strong>
          <span>{merged ? 'Three-way merge, one transaction.' : 'Checked with a dry-run three-way merge.'}</span>
        </div>
      </div>
    </>
  )
}

/**
 * The hero demo: the product loop (write → commit → review → merge) playing
 * on repeat. Pauses off-screen / in background tabs, hands control to the
 * visitor once they pick a step, and stays static for reduced motion.
 */
export function ForgeLoop() {
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const [cycle, setCycle] = useState(0)
  const [autoplay, setAutoplay] = useState(!reduced)
  const [visible, setVisible] = useState(true)
  const root = useRef<HTMLDivElement>(null)

  // Only animate while on screen and the tab is visible
  useEffect(() => {
    const el = root.current
    if (!el) return
    let inView = true
    let shown = !document.hidden
    const update = () => setVisible(inView && shown)
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update() }, { threshold: 0.3 })
    const onVisibility = () => { shown = !document.hidden; update() }
    observer.observe(el)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const playing = autoplay && visible
  useTimeout(() => {
    const next = (step + 1) % STEPS.length
    if (next === 0) setCycle((c) => c + 1)
    setStep(next)
  }, STEPS[step].ms, playing)

  const choose = (i: number) => {
    setAutoplay(false)
    setStep(i)
    setCycle((c) => c + 1)
  }

  const live = playing || !reduced

  return (
    <div className={styles.wrap} ref={root}>
      <div className={styles.window}>
        <div className={styles.chrome} aria-hidden="true">
          <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
          <span className={styles.path}>algo-playground / fibonacci.py</span>
          <span className={styles.branch}><Badge tone="ember">feature/memoized-fib</Badge></span>
        </div>
        <div className={styles.stage}>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${step}-${cycle}`}
              className={styles.panel}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
            >
              {step === 0 && <WritePanel />}
              {step === 1 && <CommitPanel live={live} />}
              {step === 2 && <ReviewPanel />}
              {step === 3 && <MergePanel live={live} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className={styles.steps} role="tablist" aria-label="Product walkthrough">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            role="tab"
            aria-selected={step === i}
            className={cx(styles.step, step === i && styles.stepActive)}
            onClick={() => choose(i)}
          >
            <span className={styles.stepNum}>0{i + 1}</span>
            <span className={styles.stepLabel}>{s.label}</span>
            {step === i && playing && (
              <motion.span
                key={`${step}-${cycle}-bar`}
                className={styles.progress}
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: s.ms / 1000, ease: 'linear' }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
