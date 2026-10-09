import { test, expect, REPO, USER } from './fixtures/test'

const PAGES = [
  '/dashboard', '/repositories', '/pull-requests', '/issues', '/gists', '/starred', '/explore',
  `/repo/${REPO.id}`,
  `/repo/${REPO.id}/issues/iiiiiiii-1111-4111-8111-111111111111`,
  `/repo/${REPO.id}/pull-requests/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`,
  `/repo/${REPO.id}/commits/c3f1a2b3c4d5e6`,
  '/gists/99999999-1111-4111-8111-111111111111',
  `/profile/${USER.id}`,
  '/admin',
]

for (const width of [320, 390, 768]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    for (const path of PAGES) {
      test(`no horizontal overflow: ${path}`, async ({ page }) => {
        await page.goto(path)
        await expect(page.locator('main h1').first()).not.toBeEmpty()
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow).toBeLessThanOrEqual(0)
      })
    }

    test('every navbar control is fully on screen and not squashed', async ({ page }) => {
      await page.goto('/dashboard')
      for (const control of [
        page.getByRole('button', { name: 'Search or jump to…' }),
        page.getByRole('button', { name: /^New$/ }),
        page.getByRole('button', { name: /account menu/i }),
      ]) {
        const box = await control.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.x + box!.width).toBeLessThanOrEqual(width)
        expect(box!.width).toBeGreaterThanOrEqual(24)
      }
      if (width < 900) {
        const menu = await page.getByRole('button', { name: 'Open navigation' }).boundingBox()
        expect(menu!.width).toBeGreaterThanOrEqual(24)
      }
    })
  })
}
