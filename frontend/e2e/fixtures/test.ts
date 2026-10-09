import { test as base, expect } from '@playwright/test'
import type { BrowserContext, Page, Route } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  ACTIVITY, AUDIT_LOGS, COMMITS, FEAT, FILES, GISTS, ISSUES, MAIN, METRICS, PLATFORM_STATS,
  PR_ACTIVITY, PR_DETAIL, PRS, REPO, REPOS, USER,
} from './data'

/** Matches VITE_SUPABASE_URL in playwright.config.ts (sb-<project ref>-auth-token). */
const SESSION_KEY = 'sb-e2e-test-auth-token'

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** Serves every /api call the app makes from ./data. Unknown routes 404 loudly. */
export async function mockApi(context: BrowserContext) {
  await context.route('**/api/**', (route) => {
    const req = route.request()
    const p = new URL(req.url()).pathname.replace(/^\/api/, '')
    const m = req.method()
    let mm: RegExpMatchArray | null

    if (p === '/health') return json(route, { status: 'ok' })
    if (p === '/auth/me') return json(route, { ...USER, avatar_url: '', bio: 'Algorithms enthusiast.', role: 'admin', created_at: new Date(Date.now() - 4e9).toISOString() })
    if (p === '/stats') return json(route, PLATFORM_STATS)
    if (p === '/activity') return json(route, ACTIVITY)
    if (p === '/repos' && m === 'GET') return json(route, REPOS)
    if (p === '/repos/starred') return json(route, REPOS.slice(0, 2))
    if (p === '/repos/explore') return json(route, REPOS.filter((r) => !r.is_private))
    if (p === '/pull-requests' && m === 'GET') return json(route, PRS)
    if (p === '/issues' && m === 'GET') return json(route, ISSUES)
    if (p === '/gists' || p === '/gists/mine') return json(route, p === '/gists' ? GISTS.filter((g) => g.is_public) : GISTS)
    if (p.startsWith('/gists/')) return json(route, GISTS.find((g) => p.endsWith(g.id)) || GISTS[0])
    if (p.startsWith('/users/')) {
      if (p.endsWith('/repos')) return json(route, REPOS.filter((r) => !r.is_private))
      if (p.endsWith('/activity')) return json(route, ACTIVITY)
      return json(route, { id: USER.id, name: USER.name, avatar_url: null, bio: 'Algorithms enthusiast.', created_at: new Date(Date.now() - 4e9).toISOString() })
    }
    if ((mm = p.match(/^\/repos\/([^/]+)$/))) return json(route, REPOS.find((r) => r.id === mm![1]) || REPO)
    if ((mm = p.match(/^\/repos\/([^/]+)\/branches$/)) && m === 'GET') return json(route, [{ ...MAIN, repo_id: mm[1] }, { ...FEAT, repo_id: mm[1] }])
    if (/^\/repos\/[^/]+\/files$/.test(p)) return m === 'GET' ? json(route, FILES) : json(route, { ...FILES[1], ...(req.postDataJSON() || {}) })
    if (/^\/repos\/[^/]+\/commits$/.test(p)) return m === 'GET' ? json(route, COMMITS) : json(route, { ...COMMITS[0], id: `new${Date.now()}` }, 201)
    if (/^\/repos\/[^/]+\/commits\/[^/]+$/.test(p)) return json(route, { commit: COMMITS[0], diff: PR_DETAIL.diff })
    if (/^\/repos\/[^/]+\/metrics$/.test(p)) return json(route, METRICS)
    if (/^\/repos\/[^/]+\/star$/.test(p)) return json(route, { starred: true, stars_count: 15 })
    if (/^\/repos\/[^/]+\/collaborators$/.test(p)) return json(route, [])
    if (/^\/issues\/repos\/[^/]+$/.test(p)) return m === 'GET' ? json(route, ISSUES) : json(route, ISSUES[0], 201)
    if (/^\/issues\/[^/]+\/comments$/.test(p)) return json(route, [])
    if ((mm = p.match(/^\/issues\/([^/]+)$/))) return json(route, ISSUES.find((i) => i.id === mm![1]) || ISSUES[0])
    if (p === '/pull-requests' && m === 'POST') return json(route, PRS[0], 201)
    if (/^\/pull-requests\/repo\/[^/]+$/.test(p)) return json(route, PRS)
    if (/^\/pull-requests\/[^/]+\/activity$/.test(p)) return json(route, PR_ACTIVITY)
    if (/^\/pull-requests\/[^/]+\/merge$/.test(p)) return json(route, { message: 'ok', commitId: 'm9' })
    if (/^\/pull-requests\/[^/]+$/.test(p)) return json(route, PR_DETAIL)
    if (/^\/execute\//.test(p)) return json(route, { stdout: 'fib(0) = 0\nfib(1) = 1\nfib(2) = 1\nfib(3) = 2\n', stderr: '', exitCode: 0 })
    if (p === '/admin/logs') return json(route, AUDIT_LOGS)
    if (p === '/admin/metrics') return json(route, { executions: METRICS, users: 9, repos: 12, storage: { snapshot_rows: 420, blob_count: 61, stored_bytes: 48000, logical_bytes: 310000 } })
    if (p.startsWith('/admin/')) return json(route, { api: 'online', supabase: 'online', docker: 'offline', timestamp: new Date().toISOString() })
    return json(route, { error: `no fixture for ${m} ${p}` }, 404)
  })
  // Nothing may reach Supabase (auth refresh, realtime)
  await context.route(/supabase\.co/, (route) => route.abort())
}

/** Puts a signed-in Supabase session in storage before the app boots. */
export async function signIn(context: BrowserContext) {
  const now = Math.floor(Date.now() / 1000)
  const session = {
    access_token: 'fake.jwt.token', refresh_token: 'fake-refresh', token_type: 'bearer', expires_in: 86400, expires_at: now + 86400,
    user: { id: USER.id, email: USER.email, aud: 'authenticated', role: 'authenticated', user_metadata: { full_name: USER.name }, app_metadata: {} },
  }
  await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [SESSION_KEY, JSON.stringify(session)] as const)
}

export async function setTheme(context: BrowserContext, theme: 'dark' | 'light') {
  await context.addInitScript((t) => localStorage.setItem('devforge-theme', t), theme)
}

/** Runs axe (WCAG 2.1 A/AA + best practice) and asserts zero violations, with readable output. */
export async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze()
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')} — ${v.nodes[0]?.failureSummary?.split('\n')[1]?.trim()}`)).toEqual([])
}

interface Options {
  /** Start each test signed in as Ada (default true) */
  signedIn: boolean
  theme: 'dark' | 'light'
}

/**
 * The base test: API mocked, Supabase blocked, optionally signed in, and any
 * uncaught page error or unexpected console error fails the test.
 */
export const test = base.extend<Options>({
  signedIn: [true, { option: true }],
  theme: ['dark', { option: true }],
  context: async ({ context, signedIn, theme }, apply) => {
    await mockApi(context)
    await setTheme(context, theme)
    if (signedIn) await signIn(context)
    await apply(context)
  },
  page: async ({ page }, apply) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (msg) => {
      // Blocked Supabase traffic and intentional 4xx fixtures are expected noise
      if (msg.type() === 'error' && !/supabase|websocket|ERR_FAILED|status of 4\d\d/i.test(msg.text())) errors.push(msg.text())
    })
    await apply(page)
    expect(errors, 'page errors / console errors').toEqual([])
  },
})

export { expect }
export * from './data'
