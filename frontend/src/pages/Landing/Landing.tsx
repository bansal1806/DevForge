import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import {
  ArrowRight, Boxes, Code2, Command as CommandIcon, Database, GitBranch, GitMerge, GitPullRequest,
  Hammer, Lock, Play, ShieldCheck, Sparkles, TestTube2, Users,
} from 'lucide-react'
import { Badge, Button, Card, LinkButton, ThemeToggle, toast } from '../../components/ui'
import { ForgeLoop } from '../../components/ForgeLoop/ForgeLoop'
import { useAuth } from '../../contexts/AuthContext'
import { getErrorMessage, getPlatformStats } from '../../lib/api'
import type { PlatformStats } from '../../lib/api'
import { signInToDemo } from '../../lib/demoLogin'
import { fadeUp, stagger } from '../../lib/motion'
import styles from './Landing.module.css'

const GITHUB_URL = 'https://github.com/bansal1806/DevForge'

const FEATURES = [
  { icon: GitBranch, title: 'Branches & history', text: 'Branch from anywhere, commit snapshots, and browse a commit graph where fresh work glows and old work cools.' },
  { icon: GitPullRequest, title: 'Pull requests & review', text: 'Diffs against the merge base, approve or request changes, and a one-click AI review of the actual diff.' },
  { icon: GitMerge, title: 'Real merges', text: 'Three-way merges with conflict detection — and a dry-run preview before anyone clicks Merge.' },
  { icon: Play, title: 'Run code in a sandbox', text: 'Python, JavaScript, TypeScript and C++ run on the branch you are viewing, with the other files importable.' },
  { icon: Users, title: 'Live collaboration', text: 'See who is in a repository and watch edits land live, scoped to the exact branch and file.' },
  { icon: CommandIcon, title: 'Keyboard first', text: 'Ctrl/⌘ K jumps to any repo, page or action; Ctrl/⌘ S saves. Issues, gists and stars round it out.' },
]

const ENGINEERING = [
  {
    icon: GitMerge,
    title: 'Three-way merges in one transaction',
    text: 'The merge runs inside Postgres: it finds the merge base by walking the commit graph, takes one-sided changes, reports files changed on both sides as conflicts, and refuses to overwrite uncommitted edits — atomically, with row locks.',
    source: 'migrations/010_content_addressed_snapshots.sql',
    code: `UPDATE merge_plan SET action = CASE
  WHEN s_has = t_has AND s_h IS NOT DISTINCT FROM t_h THEN 'keep' -- identical
  WHEN s_has = b_has AND s_h IS NOT DISTINCT FROM b_h THEN 'keep' -- only target changed
  WHEN t_has = b_has AND t_h IS NOT DISTINCT FROM b_h THEN 'take' -- only source changed
  ELSE 'conflict'
END;`,
  },
  {
    icon: ShieldCheck,
    title: 'Security enforced by the database',
    text: 'Every table has row-level security built on one access model (owner, collaborator read/write/admin, public). Emails and roles are hidden with column grants, and triggers stop rows from pointing at another repository.',
    source: 'migrations/009_security_hardening.sql',
    code: `CREATE POLICY files_select ON public.files FOR SELECT USING (private.can_read_repo(repo_id));
CREATE POLICY files_write ON public.files FOR ALL
  USING (private.can_write_repo(repo_id)) WITH CHECK (private.can_write_repo(repo_id));`,
  },
  {
    icon: Database,
    title: 'Content-addressed storage',
    text: 'Like git, each distinct file content is stored once and referenced by its SHA-256. An unchanged file costs nothing per commit, and diffs skip unchanged files by comparing hashes in SQL.',
    source: 'migrations/010_content_addressed_snapshots.sql',
    code: `INSERT INTO public.blobs (hash, content)
SELECT DISTINCT private.blob_hash(f.content), f.content
FROM public.files f
WHERE f.repo_id = p_repo AND f.branch_id = p_branch AND f.content IS NOT NULL
ON CONFLICT (hash) DO UPDATE SET last_used_at = now();`,
  },
  {
    icon: Boxes,
    title: 'Untrusted code, contained',
    text: 'Locally, runs happen in throwaway Docker containers with no network, no root, no capabilities and hard limits; in the cloud they go through Piston.',
    source: 'backend/src/services/sandbox.ts',
    code: `NetworkMode: 'none',
Memory: 256 * 1024 * 1024,
MemorySwap: 256 * 1024 * 1024, // no swap
NanoCpus: 500_000_000, // 0.5 CPU
PidsLimit: 64, // fork-bomb guard
ReadonlyRootfs: true,
Tmpfs: { '/tmp': 'rw,exec,nosuid,size=64m' },
CapDrop: ['ALL'],
SecurityOpt: ['no-new-privileges'],`,
  },
  {
    icon: TestTube2,
    title: 'Tested against real Postgres',
    text: 'Migrations run against an in-process Postgres engine on every push to prove the security model and merge logic; API tests cover each authorization rule. Design tokens are contrast-checked in CI.',
    source: 'backend/tests/migrations.test.ts',
    code: `it('blocks self-promotion to admin', async () => {
  await expect(asRole(A, () => q(\`UPDATE users SET role = 'admin' WHERE id = '\${A}'\`))).rejects.toThrow(/permission denied/);
});`,
  },
]

function useCountUp(target: number, start: boolean) {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!start) return
    if (reduced) {
      const id = requestAnimationFrame(() => setValue(target))
      return () => cancelAnimationFrame(id)
    }
    const began = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / 1200)
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, start, reduced])
  return value
}

function Stat({ value, label, start }: { value: number, label: string, start: boolean }) {
  const shown = useCountUp(value, start)
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{shown.toLocaleString()}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}

function StatsStrip() {
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  useEffect(() => {
    getPlatformStats().then(setStats).catch(() => setFailed(true))
  }, [])

  // Honest by construction: if real numbers aren't available, show nothing
  if (failed) return null

  return (
    <div ref={ref} className={styles.stats} aria-busy={!stats}>
      <span className={styles.statsCaption}><span className={styles.liveDot} aria-hidden="true" /> Live from the database</span>
      <div className={styles.statsGrid}>
        <Stat value={stats?.publicRepositories ?? 0} label="public repositories" start={inView && !!stats} />
        <Stat value={stats?.commits ?? 0} label="commits" start={inView && !!stats} />
        <Stat value={stats?.mergedPullRequests ?? 0} label="merged pull requests" start={inView && !!stats} />
        <Stat value={stats?.developers ?? 0} label="developers" start={inView && !!stats} />
      </div>
    </div>
  )
}

export default function Landing() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [demoLoading, setDemoLoading] = useState(false)

  const tryDemo = async () => {
    if (user) {
      navigate('/dashboard')
      return
    }
    setDemoLoading(true)
    try {
      await signInToDemo()
      navigate('/dashboard')
    } catch (err) {
      toast.error('Demo unavailable', { description: getErrorMessage(err, 'Please try again in a moment.') })
    } finally {
      setDemoLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skip}>Skip to content</a>

      <header className={styles.nav}>
        <Link to="/" className={styles.brand} aria-label="DevForge home">
          <span className={styles.brandMark}><Hammer size={16} /></span>
          DevForge
        </Link>
        <nav className={styles.navLinks} aria-label="Sections">
          <a href="#product">Product</a>
          <a href="#engineering">Under the hood</a>
          <Link to="/styleguide">Design system</Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <div className={styles.navActions}>
          <ThemeToggle showLabels={false} />
          {user ? (
            <LinkButton to="/dashboard" variant="primary" size="sm">Dashboard</LinkButton>
          ) : (
            <>
              <LinkButton to="/auth" variant="ghost" size="sm" className={styles.hideSm}>Sign in</LinkButton>
              <Button variant="primary" size="sm" loading={demoLoading} onClick={tryDemo}>Try the demo</Button>
            </>
          )}
        </div>
      </header>

      <main id="main">
        <section className={styles.hero}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <motion.div className={styles.heroCopy} initial="hidden" animate="visible" variants={stagger(0.08)}>
            <motion.div variants={fadeUp}>
              <Badge tone="ember" icon={<Sparkles size={12} />}>Open source · full stack · built solo</Badge>
            </motion.div>
            <motion.h1 variants={fadeUp} className={styles.heroTitle}>
              Forge code <span className="text-gradient">together.</span>
            </motion.h1>
            <motion.p variants={fadeUp} className={styles.heroText}>
              Branch, commit, review and merge in the browser — with real three-way merges, sandboxed code execution
              and live collaboration. A GitHub-style platform built from the database up.
            </motion.p>
            <motion.div variants={fadeUp} className={styles.heroActions}>
              <Button variant="primary" size="lg" loading={demoLoading} onClick={tryDemo} iconRight={<ArrowRight size={18} />}>
                {user ? 'Open your dashboard' : 'Try the live demo'}
              </Button>
              {!user && <LinkButton to="/auth" size="lg">Create an account</LinkButton>}
            </motion.div>
            {!user && (
              <motion.p variants={fadeUp} className={styles.heroNote}>
                <Lock size={13} /> No sign-up needed — the demo account is ready to explore.
              </motion.p>
            )}
          </motion.div>

          <motion.div
            className={styles.heroDemo}
            initial={{ opacity: 0, y: 24, rotate: -1 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <ForgeLoop />
          </motion.div>
        </section>

        <StatsStrip />

        <section id="product" className={styles.section}>
          <motion.div className={styles.sectionHead} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={fadeUp}>
            <span className={styles.eyebrow}>Product</span>
            <h2>Everything in the loop</h2>
            <p>The full workflow — from the first keystroke to the merge — without leaving the browser.</p>
          </motion.div>
          <motion.div className={styles.featureGrid} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger(0.06)}>
            {FEATURES.map((f) => (
              <motion.div key={f.title} variants={fadeUp}>
                <Card interactive className={styles.feature}>
                  <span className={styles.featureIcon}><f.icon size={20} /></span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <section id="engineering" className={styles.section}>
          <motion.div className={styles.sectionHead} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={fadeUp}>
            <span className={styles.eyebrow}>Under the hood</span>
            <h2>Engineered, not just styled</h2>
            <p>The interesting parts live below the UI. Every excerpt here is real code from the repository.</p>
          </motion.div>
          <div className={styles.engineering}>
            {ENGINEERING.map((item, i) => (
              <motion.article
                key={item.title}
                className={styles.engRow}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-80px' }}
                variants={fadeUp}
              >
                <div className={styles.engCopy}>
                  <span className={styles.engIndex}>0{i + 1}</span>
                  <h3><item.icon size={20} className={styles.engIcon} /> {item.title}</h3>
                  <p>{item.text}</p>
                </div>
                <figure className={styles.engFigure}>
                  <pre className={styles.engCode}><code>{item.code}</code></pre>
                  <figcaption className={styles.engSource}>{item.source}</figcaption>
                </figure>
              </motion.article>
            ))}
          </div>
        </section>

        <section className={styles.cta}>
          <motion.div className={styles.ctaInner} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2>Strike while it’s hot.</h2>
            <p>Open the demo, make a branch, commit a change, and merge your first pull request in under a minute.</p>
            <div className={styles.heroActions}>
              <Button variant="primary" size="lg" loading={demoLoading} onClick={tryDemo} iconLeft={<Hammer size={18} />}>
                {user ? 'Open your dashboard' : 'Try the live demo'}
              </Button>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={styles.ghLink}>
                <Code2 size={16} /> Read the source
              </a>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className={styles.footer}>
        <span className={styles.brand}><span className={styles.brandMark}><Hammer size={14} /></span>DevForge</span>
        <nav className={styles.footerLinks} aria-label="Footer">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
          <Link to="/styleguide">Design system</Link>
          <Link to="/auth">Sign in</Link>
        </nav>
        <span className={styles.footerNote}>Built by Rishabh Jain · MIT licensed</span>
      </footer>
    </div>
  )
}
