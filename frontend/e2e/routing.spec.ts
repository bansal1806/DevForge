import { test, expect, signIn, REPO, USER } from './fixtures/test'

test.describe('routing', () => {
  test.describe('signed out', () => {
    test.use({ signedIn: false })

    test('protected page → sign in → back to where you were going', async ({ page, context }) => {
      await page.goto('/gists?tab=mine')
      await expect(page).toHaveURL(/\/auth$/)
      await expect(page).toHaveTitle('Sign in · DevForge')
      // Signing in elsewhere (session appears in storage); the router state survives a reload
      await signIn(context)
      await page.reload()
      await expect(page).toHaveURL(/\/gists\?tab=mine$/)
    })

    test('a protocol-relative "from" is never followed', async ({ page, context }) => {
      await page.goto('/auth')
      await page.evaluate(() => history.replaceState({ usr: { from: { pathname: '//evil.example/x' } }, key: 'k', idx: 0 }, '', '/auth'))
      await signIn(context)
      await page.reload()
      await expect(page).toHaveURL('/dashboard')
    })
  })

  test('a crashing page is contained and recovers on navigation', async ({ page }) => {
    await page.route(/\/api\/repos\/starred$/, (route) => route.fulfill({ json: [null] }))
    // This test triggers an error on purpose
    page.removeAllListeners('pageerror')
    page.removeAllListeners('console')
    await page.goto('/dashboard')
    await page.getByRole('link', { name: /^Starred/ }).first().click()
    await expect(page.getByText('This page hit a snag')).toBeVisible()
    await expect(page.getByRole('button', { name: /account menu/i })).toBeVisible()
    await page.getByRole('link', { name: /^Explore/ }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: /Explore/ })).toBeVisible()
  })

  test('slow page code shows the in-shell skeleton', async ({ page }) => {
    await page.route(/\/src\/pages\/Admin\//, async (route) => {
      await new Promise((r) => setTimeout(r, 1200))
      await route.fallback()
    })
    await page.goto('/dashboard')
    await expect(page.locator('main h1')).toBeVisible()
    await page.evaluate(() => { history.pushState({}, '', '/admin'); dispatchEvent(new PopStateEvent('popstate')) })
    await expect(page.getByLabel('Loading page')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Admin' })).toBeVisible({ timeout: 10_000 })
  })

  test('unknown routes render the 404 page', async ({ page }) => {
    await page.goto(`/repo/${REPO.id}/nope/${USER.id}`)
    await expect(page).toHaveTitle('Page not found · DevForge')
  })
})

test.describe('theme default', () => {
  test.use({ signedIn: false })

  for (const scheme of ['light', 'dark'] as const) {
    test(`first visit follows the OS (${scheme})`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme: scheme })
      await context.route('**/api/**', (route) => route.fulfill({ json: { publicRepositories: 1, commits: 1, mergedPullRequests: 1, developers: 1 } }))
      const page = await context.newPage()
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
      await context.close()
    })
  }
})
