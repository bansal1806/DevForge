import { test, expect, REPO } from './fixtures/test'

test.describe('app shell and dashboard', () => {
  test('dashboard shows real totals, not invented trends', async ({ page }) => {
    await page.goto('/dashboard')
    const overview = page.getByRole('region', { name: 'Overview' })
    await expect(overview).toContainText(/4\s*Repositories/)
    await expect(overview).toContainText(/58\s*Stars received/)
    await expect(overview).not.toContainText(/\+1|\bNew\b/)
    await expect(page.locator(`main a[href="/repo/${REPO.id}"]`).first()).toContainText('14')
    await expect(page.locator('aside').getByText('API online')).toBeVisible()
  })

  test('theme can be switched from the account menu', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /account menu/i }).click()
    await page.getByRole('menu').getByRole('menuitemradio', { name: 'Day' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('sidebar loads recent repositories on any page', async ({ page }) => {
    await page.goto(`/repo/${REPO.id}`)
    await expect(page.locator('aside').getByText('devforge-notes')).toBeVisible()
  })

  test.describe('mobile', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('navigation drawer opens, navigates and closes', async ({ page }) => {
      await page.goto('/dashboard')
      await page.getByRole('button', { name: 'Open navigation' }).click()
      const drawer = page.getByRole('dialog', { name: 'Navigate' })
      await expect(drawer).toBeVisible()
      await drawer.getByRole('link', { name: 'Explore' }).click()
      await expect(page).toHaveURL(/\/explore$/)
      await expect(drawer).toBeHidden()
    })
  })
})
