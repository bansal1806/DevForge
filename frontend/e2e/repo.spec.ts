import { test, expect, REPO } from './fixtures/test'
import type { Page } from '@playwright/test'

const editorText = (page: Page) => page.locator('.monaco-editor .view-lines').first()

async function openFile(page: Page, name: string) {
  const tree = page.getByRole('list', { name: 'Files' })
  if (name.includes('/') && !(await tree.getByText(name.split('/').pop()!).isVisible())) {
    await tree.getByText(name.split('/')[0], { exact: true }).click()
  }
  await tree.getByText(name.split('/').pop()!, { exact: true }).click()
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 20_000 })
}

test.describe('repository IDE', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/repo/${REPO.id}`)
    await expect(page.getByRole('heading', { level: 1, name: 'algo-playground' })).toBeVisible()
  })

  test('README renders until a file is opened; files open as tabs', async ({ page }) => {
    await expect(page.locator('article').getByRole('heading', { name: 'algo-playground' })).toBeVisible()
    await openFile(page, 'fibonacci.py')
    await openFile(page, 'src/quicksort.js')
    const tabs = page.getByRole('tablist', { name: 'Open files' }).getByRole('tab')
    await expect(tabs).toHaveCount(2)
    await expect(page.locator('[class*="breadcrumb"]')).toContainText(/src[\s\S]*quicksort\.js/)
    await page.getByRole('tab', { name: /fibonacci\.py/ }).click()
    await expect(editorText(page)).toContainText('def fib')
    await page.getByRole('button', { name: 'Close src/quicksort.js' }).click()
    await expect(tabs).toHaveCount(1)
  })

  test('edit, Ctrl+S, run and commit with sparks', async ({ page }) => {
    await openFile(page, 'fibonacci.py')
    const status = page.locator('footer').last()
    await expect(status).toContainText('Python')

    await editorText(page).click()
    await page.keyboard.press('End')
    await page.keyboard.type('  # edited')
    await expect(status).toContainText('Unsaved')
    const save = page.waitForRequest((r) => r.url().includes('/files') && r.method() === 'POST')
    await page.keyboard.press('Control+s')
    await save
    await expect(status).toContainText('Saved')

    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.locator('[class*="terminal"]').first()).toContainText('fib(3) = 2')

    await page.getByRole('button', { name: 'Commit changes' }).click()
    await page.getByRole('textbox', { name: 'Commit message' }).fill('Edit fibonacci')
    const commit = page.waitForRequest((r) => r.url().includes('/commits') && r.method() === 'POST')
    await page.getByRole('button', { name: /Commit to main/ }).click()
    await commit
    await expect(page.locator('body > canvas')).toHaveCount(1)
  })

  test('a committed edit survives switching tabs (regression)', async ({ page }) => {
    await openFile(page, 'fibonacci.py')
    await editorText(page).click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('# committed edit')
    await page.getByRole('button', { name: 'Commit changes' }).click()
    await page.getByRole('textbox', { name: 'Commit message' }).fill('edit')
    await page.getByRole('button', { name: /Commit to main/ }).click()
    await expect(page.getByText('Changes committed.')).toBeVisible()
    await openFile(page, 'src/quicksort.js')
    await page.getByRole('tab', { name: /fibonacci\.py/ }).click()
    await expect(editorText(page)).toContainText('# committed edit')
  })

  test('Ctrl+S on a clean file sends nothing (regression)', async ({ page }) => {
    await openFile(page, 'fibonacci.py')
    let saves = 0
    page.on('request', (r) => { if (r.url().includes('/files') && r.method() === 'POST') saves++ })
    await editorText(page).click()
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(300)
    expect(saves).toBe(0)
  })

  test('branch menu, other tabs, commit graph and insights', async ({ page }) => {
    await page.getByRole('button', { name: /main/ }).first().click()
    await expect(page.getByRole('menuitemradio', { name: /feature\/memoized-fib/ })).toBeVisible()
    await page.keyboard.press('Escape')

    const sections = page.getByRole('tablist', { name: 'Repository sections' })
    await sections.getByRole('tab', { name: /Issues/ }).click()
    await expect(page.getByText('Add a heap sort example')).toBeVisible()
    await sections.getByRole('tab', { name: /Pull Requests/ }).click()
    await expect(page.getByText('Memoize fibonacci for exponential speedup')).toBeVisible()
    await sections.getByRole('tab', { name: /Commits/ }).click()
    await expect(page.getByText('Tune quicksort pivot selection').first()).toBeVisible()
    await sections.getByRole('tab', { name: /Insights/ }).click()
    await expect(page.getByText('Success rate')).toBeVisible()
    await expect(page.locator('.recharts-line-curve')).toHaveCount(1)
    await expect(page.locator('circle[fill="var(--chart-error)"]')).toHaveCount(1)
  })

  test('moving to another repo never shows stale files (regression)', async ({ page }) => {
    const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    await openFile(page, 'fibonacci.py')
    const seen: string[] = []
    await page.route(new RegExp(`/api/repos/${other}/files`), async (route) => {
      await new Promise((r) => setTimeout(r, 600))
      await route.fulfill({ json: [] })
    })
    page.on('request', (r) => { if (r.url().includes(other)) seen.push(new URL(r.url()).pathname.split('/').pop()!) })
    await page.evaluate((id) => { history.pushState({}, '', `/repo/${id}`); dispatchEvent(new PopStateEvent('popstate')) }, other)
    await expect(page.getByRole('list', { name: 'Files' }).getByText('fibonacci.py')).toBeHidden()
    await expect.poll(() => seen.includes('files')).toBe(true)
    expect(seen.indexOf('files')).toBeGreaterThan(seen.indexOf('branches'))
  })
})

test.describe('repository IDE (light theme)', () => {
  test.use({ theme: 'light' })

  test('Monaco follows the light theme', async ({ page }) => {
    await page.goto(`/repo/${REPO.id}`)
    await openFile(page, 'fibonacci.py')
    await expect(page.locator('.monaco-editor.vs').first()).toBeVisible()
  })
})
