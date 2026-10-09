import { test, expect, REPO, PR_DETAIL } from './fixtures/test'

const ISSUE = `/repo/${REPO.id}/issues/iiiiiiii-1111-4111-8111-111111111111`
const PR = `/repo/${REPO.id}/pull-requests/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`

test.describe('issues and pull requests', () => {
  test('issue list filters by status and searches by author', async ({ page }) => {
    await page.goto('/issues')
    const filters = page.getByRole('radiogroup', { name: 'Filter by status' })
    await expect(filters.getByRole('radio', { name: /Open/ })).toContainText('1')
    await expect(page.getByRole('link', { name: /Add a heap sort example/ })).toBeVisible()
    await expect(page.getByText('quicksort recursion depth')).toBeHidden()

    await filters.getByRole('radio', { name: /Closed/ }).click()
    await expect(page.getByRole('link', { name: /quicksort recursion depth/ })).toBeVisible()
    await page.getByRole('searchbox').fill('zzz')
    await expect(page.getByText('No matches')).toBeVisible()
    await page.getByRole('searchbox').fill('linus')
    await page.getByRole('link', { name: /quicksort recursion depth/ }).click()
    await expect(page).toHaveURL(/\/issues\/iiiiiiii-2222/)
  })

  test('issue detail: close, markdown preview, Ctrl+Enter to comment', async ({ page }) => {
    await page.goto(ISSUE)
    await expect(page.getByRole('heading', { level: 1, name: /Add a heap sort example/ })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Issue details' })).not.toContainText('bug')

    const patch = page.waitForRequest((r) => r.url().includes('/issues/iiiiiiii-1111') && r.method() === 'PATCH')
    await page.getByRole('button', { name: /Close issue/i }).click()
    await patch

    const box = page.getByRole('textbox', { name: 'Comment' })
    await box.fill('Working on it **now**')
    await page.getByRole('tab', { name: 'Preview' }).click()
    await expect(page.locator('strong', { hasText: 'now' })).toBeVisible()
    await page.getByRole('tab', { name: 'Write' }).click()
    const post = page.waitForRequest((r) => r.url().includes('/comments') && r.method() === 'POST')
    await box.press('Control+Enter')
    await post
  })

  test('PR list shows branches and filters merged', async ({ page }) => {
    await page.goto('/pull-requests')
    await expect(page.locator('main')).toContainText('feature/memoized-fib → main')
    await page.getByRole('radio', { name: /Merged/ }).click()
    await expect(page.getByRole('link', { name: /Add binary search example/ })).toBeVisible()
  })

  test('PR conversation, merge panel and merge with sparks', async ({ page }) => {
    await page.goto(PR)
    await expect(page.getByRole('heading', { name: /ready to merge/ })).toBeVisible()
    await expect(page.getByText('Nice speedup — LGTM.')).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Pull request details' })).toContainText('1 file changed')
    const merge = page.waitForRequest((r) => r.url().endsWith('/merge') && r.method() === 'POST')
    await page.getByRole('button', { name: 'Merge pull request' }).click()
    await merge
    await expect(page.locator('body > canvas')).toHaveCount(1)
  })

  test('PR diff folds unchanged lines and collapses files', async ({ page }) => {
    const old = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n') + '\n'
    await page.route(/\/api\/pull-requests\/[0-9a-f-]+$/, (route) => route.fulfill({
      json: {
        ...PR_DETAIL,
        diff: {
          ...PR_DETAIL.diff,
          'src/long.txt': { status: 'modified', originalContent: old, content: old.replace('line 20\n', 'line 20 changed\n') },
          'src/new.py': { status: 'added', originalContent: null, content: 'print("hi")\n' },
        },
      },
    }))
    await page.goto(PR)
    await page.getByRole('tab', { name: /Files changed/ }).click()
    await expect(page.locator('main')).toContainText('3 files changed')
    const folds = page.getByRole('button', { name: /Show \d+ unchanged lines/ })
    await expect(folds).toHaveCount(2)
    await folds.first().click()
    await expect(folds).toHaveCount(1)
    await page.getByRole('button', { name: /src\/new\.py/ }).click()
    await expect(page.getByText('print("hi")')).toBeHidden()
  })

  test('commit detail renders its diff', async ({ page }) => {
    await page.goto(`/repo/${REPO.id}/commits/c3f1a2b3c4d5e6`)
    await expect(page.getByRole('heading', { level: 1, name: 'Tune quicksort pivot selection' })).toBeVisible()
    await expect(page.getByText('from functools import lru_cache')).toBeVisible()
  })

  test('markdown headings never add a second h1 (regression)', async ({ page }) => {
    await page.route(/\/api\/issues\/iiiiiiii-1111[^/]*$/, (route) => route.fulfill({
      json: { id: 'iiiiiiii-1111-4111-8111-111111111111', repo_id: REPO.id, author_id: 'x', title: 'Heading test', description: '# Big heading\n\ntext', status: 'open', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    }))
    await page.goto(ISSUE)
    await expect(page.getByRole('heading', { name: 'Big heading' })).toBeVisible()
    await expect(page.locator('main h1')).toHaveCount(1)
  })
})
