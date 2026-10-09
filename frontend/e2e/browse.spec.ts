import { test, expect } from './fixtures/test'

const repoCards = 'main a[href^="/repo/"]'

test.describe('browse pages', () => {
  test('repositories: real counts, filter, sort, URL-synced search', async ({ page }) => {
    await page.goto('/repositories')
    const cards = page.locator(repoCards)
    await expect(cards).toHaveCount(4)
    const visibility = page.getByRole('radiogroup', { name: 'Visibility' })
    await expect(visibility).toContainText(/All\s*4/)
    await expect(visibility).toContainText(/Private\s*1/)
    await expect(page.locator('main')).not.toContainText('TypeScript')

    await visibility.getByRole('radio', { name: /Private/ }).click()
    await expect(cards).toHaveCount(1)
    await visibility.getByRole('radio', { name: /All/ }).click()
    await page.getByRole('radiogroup', { name: 'Sort by' }).getByRole('radio', { name: 'Stars' }).click()
    await expect(cards.first()).toContainText('rust-raytracer')

    await page.getByRole('searchbox').fill('notes')
    await expect(cards).toHaveCount(1)
    await expect(page).toHaveURL(/search=notes/)
    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(cards).toHaveCount(4)
  })

  test('explore: public repos with owners, debounced server search', async ({ page }) => {
    await page.goto('/explore')
    await expect(page.locator(repoCards)).toHaveCount(3)
    await expect(page.locator(repoCards).first()).toContainText('Ada Lovelace /')
    const search = page.waitForRequest((r) => r.url().includes('/repos/explore?q=ray'))
    await page.getByRole('searchbox').fill('ray')
    await search
    await expect(page.getByRole('status').getByText(/results? for “ray”/)).toBeVisible()
  })

  test('starred shows filled stars', async ({ page }) => {
    await page.goto('/starred')
    await expect(page.locator(repoCards)).toHaveCount(2)
    await expect(page.locator('main svg[class*="starred"]')).toHaveCount(2)
  })

  test('gists: real code previews; "My gists" includes secret ones', async ({ page }) => {
    await page.goto('/gists')
    const cards = page.locator('main a[href^="/gists/"]')
    await expect(cards).toHaveCount(2)
    await expect(page.locator('main pre').first()).toContainText('export function debounce')
    await expect(page.getByText('+1 more')).toBeVisible()
    await page.getByRole('radio', { name: 'My gists' }).click()
    await expect(cards).toHaveCount(3)
    await expect(page.getByText('secret', { exact: true })).toBeVisible()
  })

  test('gist detail: files render and download works', async ({ page }) => {
    await page.goto('/gists/99999999-1111-4111-8111-111111111111')
    await expect(page.locator('.monaco-editor')).toHaveCount(2, { timeout: 20_000 })
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download debounce.ts' }).click()
    expect((await download).suggestedFilename()).toBe('debounce.ts')
  })

  test('profile and admin', async ({ page }) => {
    await page.goto('/profile/11111111-1111-4111-8111-111111111111')
    await expect(page.getByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeVisible()
    await expect(page.locator('main')).toContainText(/58\s*stars earned/i)

    await page.goto('/admin')
    await expect(page.getByRole('region', { name: 'Service health' })).toContainText(/API server[\s\S]*online/i)
    await expect(page.getByText(/6\.5× deduplicated/)).toBeVisible()
    await expect(page.locator('.recharts-xAxis .recharts-cartesian-axis-tick')).toHaveCount(7)
    await expect(page.getByText('collaborator added')).toBeVisible()
  })
})
