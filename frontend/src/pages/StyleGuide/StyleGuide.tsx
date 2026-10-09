import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  GitBranch, GitCommitHorizontal, GitMerge, Play, Plus, Search, Settings, Star, Trash2, Hammer,
} from 'lucide-react'
import {
  Avatar, AvatarStack, Badge, Button, Card, EmptyState, IconButton, Input, Kbd, Modal, Select,
  Skeleton, SkeletonText, Spinner, Tabs, Textarea, ThemeToggle, Tooltip, toast, useDialog,
} from '../../components/ui'
import { fadeUp, stagger } from '../../lib/motion'
import { sparkBurst } from '../../lib/sparks'
import { CommitGraph } from '../../components/CommitGraph/CommitGraph'
import { TerminalOutput } from '../../components/TerminalOutput/TerminalOutput'
import type { ExecutionResult } from '../../lib/api'
import type { Commit } from '../../lib/api'
import styles from './StyleGuide.module.css'

const SWATCHES: [string, string][] = [
  ['--color-bg', 'Background'],
  ['--color-surface', 'Surface'],
  ['--color-surface-2', 'Surface 2'],
  ['--color-surface-3', 'Surface 3'],
  ['--color-text', 'Text'],
  ['--color-text-secondary', 'Secondary'],
  ['--color-text-muted', 'Muted'],
  ['--color-ember', 'Ember'],
  ['--color-steel', 'Steel'],
  ['--color-success', 'Success'],
  ['--color-danger', 'Danger'],
  ['--color-warning', 'Warning'],
  ['--color-info', 'Info'],
]

const TYPE_SCALE: [string, string, string][] = [
  ['Display 5xl', 'var(--text-5xl)', 'var(--font-display)'],
  ['Heading 3xl', 'var(--text-3xl)', 'var(--font-display)'],
  ['Heading xl', 'var(--text-xl)', 'var(--font-display)'],
  ['Body lg', 'var(--text-lg)', 'var(--font-body)'],
  ['Body base', 'var(--text-base)', 'var(--font-body)'],
  ['Small', 'var(--text-sm)', 'var(--font-body)'],
  ['Code', 'var(--text-sm)', 'var(--font-code)'],
]

// Sample history for the graph demo (timestamps relative to page load)
function sampleCommits(): Commit[] {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
  const base = { repo_id: 'demo', branch_id: 'main', author_id: 'a', merge_parent_id: null as string | null }
  return [
    { ...base, id: 'c5f1a2b3c4d5', message: 'Tune quicksort pivot selection', created_at: ago(3), author: { id: 'a', name: 'Ada Lovelace', avatar_url: null }, parent_id: 'm4' },
    { ...base, id: 'm4e7d6c5b4a3', message: 'Merge pull request "Memoize fibonacci" (feature/memoized-fib → main)', created_at: ago(95), merge_parent_id: 'f2', author: { id: 'b', name: 'Grace Hopper', avatar_url: null }, parent_id: 'c3' },
    { ...base, id: 'c3a9b8c7d6e5', message: 'Add binary search example', created_at: ago(60 * 5), author: { id: 'a', name: 'Ada Lovelace', avatar_url: null }, parent_id: 'c1' },
    { ...base, id: 'c1f0e9d8c7b6', message: 'Initial commit: fibonacci and quicksort', created_at: ago(60 * 24 * 9), author: { id: 'c', name: 'Linus Torvalds', avatar_url: null }, parent_id: null },
  ]
}

const FIB_OUTPUT = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34].map((v, i) => `fib(${i}) = ${v}`).join('\n') + '\n'
const SAMPLE_RUNS: Record<'ok' | 'fail' | 'timeout', { result: ExecutionResult, ms: number }> = {
  ok: { result: { stdout: FIB_OUTPUT, stderr: '', exitCode: 0 }, ms: 842 },
  fail: {
    result: {
      stdout: 'Sorting...\n',
      stderr: 'Traceback (most recent call last):\n  File "quicksort.py", line 4, in <module>\n    pivot = arr[0]\nIndexError: list index out of range\n',
      exitCode: 1,
    },
    ms: 412,
  },
  timeout: { result: { stdout: '', stderr: 'Execution timed out after 10s', exitCode: 124, timedOut: true }, ms: 10012 },
}

const PEOPLE = [
  { id: '1', name: 'Ada Lovelace', live: true },
  { id: '2', name: 'Grace Hopper', live: true },
  { id: '3', name: 'Linus Torvalds' },
  { id: '4', name: 'Margaret Hamilton' },
  { id: '5', name: 'Ken Thompson' },
  { id: '6', name: 'Barbara Liskov' },
]

function Section({ id, title, description, children }: { id: string, title: string, description?: string, children: React.ReactNode }) {
  return (
    <motion.section
      id={id}
      className={styles.section}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={fadeUp}
    >
      <div className={styles.sectionHead}>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </motion.section>
  )
}

/** The same mini-composition rendered in a given theme, for side-by-side review. */
function ThemeSample({ theme }: { theme: 'dark' | 'light' }) {
  return (
    <div data-theme={theme} className={styles.themePanel}>
      <div className={styles.row} style={{ justifyContent: 'space-between' }}>
        <span className={styles.label}>{theme === 'dark' ? 'Night Forge' : 'Daylight'}</span>
        <Badge tone="success" dot>Live</Badge>
      </div>
      <div className={styles.swatches}>
        {SWATCHES.map(([token, name]) => (
          <div key={token} className={styles.swatch}>
            <div className={styles.chip} style={{ background: `var(${token})` }} />
            {name}
          </div>
        ))}
      </div>
      <div className={styles.molten}>Molten — primary actions only</div>
      <Card>
        <div className={styles.row} style={{ justifyContent: 'space-between' }}>
          <div className={styles.row}>
            <Avatar name="Ada Lovelace" live />
            <div>
              <div style={{ fontWeight: 600 }}>algo-playground</div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Updated 2 minutes ago</div>
            </div>
          </div>
          <Badge tone="ember">main</Badge>
        </div>
        <div className={styles.row} style={{ marginTop: 'var(--space-4)' }}>
          <Button variant="primary" size="sm" iconLeft={<GitCommitHorizontal size={14} />}>Commit</Button>
          <Button size="sm" iconLeft={<GitBranch size={14} />}>Branch</Button>
          <Button variant="ghost" size="sm">Cancel</Button>
        </div>
      </Card>
      <Input label="Branch name" placeholder="feature/my-change" mono hint="Letters, numbers, - _ . /" />
    </div>
  )
}

export default function StyleGuide() {
  const dialog = useDialog()
  const [tab, setTab] = useState('code')
  const [modalOpen, setModalOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [listKey, setListKey] = useState(0)
  const [nameError, setNameError] = useState<string | null>('That name is already taken')
  const [commits] = useState(sampleCommits)
  const [run, setRun] = useState<{ running: boolean, result: ExecutionResult | null, id: number, ms: number | null }>({ running: false, result: null, id: 0, ms: null })

  const simulateRun = (kind: keyof typeof SAMPLE_RUNS) => {
    setRun((r) => ({ ...r, running: true, result: null, ms: null }))
    window.setTimeout(() => setRun((r) => ({ running: false, result: SAMPLE_RUNS[kind].result, id: r.id + 1, ms: SAMPLE_RUNS[kind].ms })), 1200)
  }

  const runLoading = (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget
    setLoadingDemo(true)
    window.setTimeout(() => {
      setLoadingDemo(false)
      sparkBurst(button, { count: 34, power: 7.5 })
      toast.success('Committed to main', { description: '3 files changed' })
    }, 1400)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          <span className={styles.brandMark}><Hammer size={16} /></span>
          DevForge <span className={styles.brandSub} style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>/ design system</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className={styles.main}>
        <motion.div className={styles.hero} initial="hidden" animate="visible" variants={fadeUp}>
          <h1>The <span className="text-gradient">forge</span>.</h1>
          <p>
            Warm charcoal like an anvil, one molten ember reserved for the moments that matter, and cool steel for
            structure. Every component below reads from the same tokens and works in both themes.
          </p>
          <div className={styles.heroMeta}>
            <Badge tone="ember">Phase 0 — foundations</Badge>
            <Badge tone="success" dot>WCAG AA contrast verified</Badge>
            <Badge tone="steel">Respects reduced motion</Badge>
          </div>
        </motion.div>

        <Section id="themes" title="Two themes" description="Night Forge (default) and Daylight, side by side. Use the toggle above to switch the whole page; System follows your OS.">
          <div className={styles.grid2}>
            <ThemeSample theme="dark" />
            <ThemeSample theme="light" />
          </div>
        </Section>

        <Section id="type" title="Typography" description="Bricolage Grotesque for headings, Geist for interface text, JetBrains Mono for code.">
          <div>
            {TYPE_SCALE.map(([name, size, family]) => (
              <div key={name} className={styles.typeRow}>
                <span className={styles.label}>{name}</span>
                <span style={{ fontSize: size, fontFamily: family, fontWeight: family.includes('display') ? 700 : 400, lineHeight: 1.2 }}>
                  {family.includes('code') ? 'git merge feature/memoized-fib' : 'Forge your code together'}
                </span>
              </div>
            ))}
          </div>
          <pre className={styles.code}>
            <span className={styles.codeKeyword}>def</span> fib(n):{'\n'}
            {'    '}<span className={styles.codeKeyword}>return</span> n <span className={styles.codeKeyword}>if</span> n {'<'} 2 <span className={styles.codeKeyword}>else</span> fib(n - 1) + fib(n - 2){'\n'}
            print(<span className={styles.codeString}>"forged"</span>)
          </pre>
        </Section>

        <Section id="buttons" title="Buttons" description="Primary is molten — use it once per view for the main action. Secondary for everything else, ghost for low emphasis, danger for destructive actions.">
          <div className={styles.row}>
            <Button variant="primary" iconLeft={<GitMerge size={16} />}>Merge pull request</Button>
            <Button iconLeft={<GitBranch size={16} />}>New branch</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger" iconLeft={<Trash2 size={16} />}>Delete</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className={styles.row}>
            <Button variant="primary" size="sm">Small</Button>
            <Button variant="primary">Medium</Button>
            <Button variant="primary" size="lg" iconRight={<Play size={18} />}>Large</Button>
            <Button variant="primary" loading={loadingDemo} onClick={runLoading} iconLeft={<GitCommitHorizontal size={16} />}>
              Commit (try me)
            </Button>
          </div>
          <div className={styles.row}>
            <IconButton label="Search" icon={<Search size={18} />} />
            <IconButton label="Star" icon={<Star size={18} />} variant="secondary" />
            <IconButton label="Settings" icon={<Settings size={18} />} />
            <Tooltip content="Create a new file">
              <IconButton label="New file" icon={<Plus size={18} />} variant="secondary" />
            </Tooltip>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Hover or focus the last one for a tooltip.</span>
          </div>
        </Section>

        <Section id="badges" title="Badges & keys">
          <div className={styles.row}>
            <Badge>neutral</Badge>
            <Badge tone="ember">ember</Badge>
            <Badge tone="success" dot>open</Badge>
            <Badge tone="info">info</Badge>
            <Badge tone="warning">warning</Badge>
            <Badge tone="danger" dot>conflict</Badge>
            <Badge tone="steel" icon={<GitBranch size={12} />}>feature/x</Badge>
          </div>
          <div className={styles.row} style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Open the command palette with <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> · save with <Kbd>Ctrl</Kbd> <Kbd>S</Kbd>
          </div>
        </Section>

        <Section id="forms" title="Form fields" description="Labels are always visible; hints and errors are announced to screen readers.">
          <div className={styles.grid2}>
            <Input label="Repository name" placeholder="algo-playground" hint="Letters, numbers, dot, dash and underscore." />
            <Input
              label="Branch name"
              mono
              defaultValue="main"
              error={nameError}
              onChange={() => setNameError(null)}
            />
            <Textarea label="Description" optional placeholder="What are you forging?" />
            <Select label="Permission" defaultValue="write">
              <option value="read">Read</option>
              <option value="write">Write</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
        </Section>

        <Section id="surfaces" title="Cards, tabs & avatars">
          <Tabs
            label="Repository sections"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'code', label: 'Code' },
              { id: 'issues', label: 'Issues', count: 3 },
              { id: 'prs', label: 'Pull requests', count: 1 },
              { id: 'commits', label: 'Commits' },
            ]}
          />
          <div className={styles.grid3}>
            <Card>
              <span className={styles.label}>Static card</span>
              <p style={{ marginTop: 'var(--space-2)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                Selected tab: <strong style={{ color: 'var(--color-text)' }}>{tab}</strong>. Use arrow keys on the tabs.
              </p>
            </Card>
            <Card interactive tabIndex={0}>
              <span className={styles.label}>Interactive card</span>
              <p style={{ marginTop: 'var(--space-2)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                Hover me — lifts with an ember edge.
              </p>
            </Card>
            <Card>
              <span className={styles.label}>Who's here</span>
              <div className={styles.row} style={{ marginTop: 'var(--space-3)' }}>
                <AvatarStack people={PEOPLE} max={4} />
                <Avatar name="Ada Lovelace" size={40} live />
              </div>
            </Card>
          </div>
        </Section>

        <Section id="history" title="Commit history" description="The rail draws itself as you scroll. Fresh commits glow molten and cool to steel with age; merges bring in a second rail.">
          <Card padding="sm">
            <CommitGraph commits={commits} repoId="demo" />
          </Card>
        </Section>

        <Section id="terminal" title="Run output" description="A heating bar while code runs, output printed like a terminal, then a status pill that cools green — or shakes red.">
          <div className={styles.row}>
            <Button variant="primary" size="sm" iconLeft={<Play size={14} />} onClick={() => simulateRun('ok')}>Run success</Button>
            <Button size="sm" onClick={() => simulateRun('fail')}>Run failure</Button>
            <Button size="sm" variant="ghost" onClick={() => simulateRun('timeout')}>Run timeout</Button>
          </div>
          <div style={{ height: 260, borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            <TerminalOutput
              fileName="fibonacci.py"
              running={run.running}
              result={run.result}
              runId={run.id}
              durationMs={run.ms}
              onClear={() => setRun((r) => ({ ...r, result: null }))}
              onClose={() => undefined}
            />
          </div>
        </Section>

        <Section id="loading" title="Loading & empty states" description="Skeletons replace 'Loading...' text; the shimmer stops under reduced motion.">
          <div className={styles.grid2}>
            <Card>
              <div className={styles.row}>
                <Skeleton width={40} height={40} radius="50%" />
                <div style={{ flex: 1, display: 'grid', gap: 8 }}>
                  <Skeleton width="45%" height={16} />
                  <Skeleton width="70%" height={12} />
                </div>
              </div>
              <div style={{ marginTop: 'var(--space-4)' }}><SkeletonText lines={3} /></div>
              <div className={styles.row} style={{ marginTop: 'var(--space-4)', color: 'var(--color-ember)' }}>
                <Spinner /> <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Spinner</span>
              </div>
            </Card>
            <Card padding="none">
              <EmptyState
                title="No pull requests yet"
                description="Create a branch, commit a change, and open a pull request to start a review."
                action={<Button variant="primary" size="sm" iconLeft={<Plus size={14} />}>New pull request</Button>}
              />
            </Card>
          </div>
        </Section>

        <Section id="overlays" title="Dialogs, drawers & toasts" description="These replace the browser's blocking prompt/confirm/alert across the app.">
          <div className={styles.row}>
            <Button onClick={() => setModalOpen(true)}>Open modal</Button>
            <Button onClick={() => setDrawerOpen(true)}>Open drawer</Button>
            <Button
              onClick={async () => {
                const name = await dialog.prompt({
                  title: 'Create a branch',
                  description: 'Branches from main with all of its files.',
                  label: 'Branch name',
                  placeholder: 'feature/my-change',
                  mono: true,
                  confirmLabel: 'Create branch',
                  validate: (v) => (/^[A-Za-z0-9._/-]+$/.test(v) ? null : 'Use letters, numbers, ".", "-", "_" and "/"'),
                })
                if (name) toast.success(`Branch "${name}" created`)
              }}
            >
              Prompt
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const ok = await dialog.confirm({
                  title: 'Delete algo-playground?',
                  message: 'This permanently deletes the repository. It cannot be undone.',
                  confirmLabel: 'Delete repository',
                  tone: 'danger',
                  requireText: 'algo-playground',
                })
                if (ok) toast.error('Deleted (not really — this is the style guide)')
              }}
            >
              Type-to-confirm
            </Button>
          </div>
          <div className={styles.row}>
            <Button variant="ghost" onClick={() => toast.success('Merged pull request', { description: 'feature/memoized-fib → main' })}>Success toast</Button>
            <Button variant="ghost" onClick={() => toast.error('Merge blocked', { description: 'a.txt changed on both branches' })}>Error toast</Button>
            <Button variant="ghost" onClick={() => toast('Ada joined the repository')}>Info toast</Button>
          </div>
        </Section>

        <Section id="motion" title="Motion" description="Quick ease-outs for feedback, a soft spring for things that land. Everything respects your OS reduce-motion setting.">
          <div className={styles.row}>
            <Button onClick={() => setListKey((k) => k + 1)}>Replay list entrance</Button>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={listKey} className={styles.motionList} initial="hidden" animate="visible" variants={stagger(0.07)}>
              {['Initial commit', 'Memoize fibonacci with lru_cache', 'Merge pull request "Memoize fibonacci"'].map((msg, i) => (
                <motion.div key={msg} className={styles.motionItem} variants={fadeUp}>
                  {i === 2 ? <GitMerge size={16} color="var(--color-violet)" /> : <GitCommitHorizontal size={16} color="var(--color-ember)" />}
                  <span style={{ fontWeight: 500 }}>{msg}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-code)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {['a1b2c3d', '9f8e7d6', '4c5d6e7'][i]}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        </Section>
      </main>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Open a pull request"
        description="Propose merging feature/memoized-fib into main."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setModalOpen(false); toast.success('Pull request opened') }}>Open pull request</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <Input label="Title" defaultValue="Memoize fibonacci for exponential speedup" />
          <Textarea label="Description" optional placeholder="What does this change and why?" />
        </div>
      </Modal>

      <Modal open={drawerOpen} onClose={() => setDrawerOpen(false)} side="right" title="Repository settings" description="Drawers slide in from the edge — used for side panels and on mobile.">
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <Input label="Repository name" defaultValue="algo-playground" />
          <Select label="Default branch" defaultValue="main">
            <option>main</option>
            <option>feature/memoized-fib</option>
          </Select>
          <Button variant="primary" onClick={() => setDrawerOpen(false)}>Save changes</Button>
        </div>
      </Modal>
    </div>
  )
}
