import { test, expect, expectNoA11yViolations, REPO, USER } from './fixtures/test'

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

for (const theme of ['dark', 'light'] as const) {
  test.describe(`axe (${theme})`, () => {
    test.use({ theme, reducedMotion: 'reduce' })
    for (const path of PAGES) {
      test(path, async ({ page }) => {
        await page.goto(path)
        await expect(page.locator('main h1').first()).not.toBeEmpty()
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
        await expectNoA11yViolations(page)
      })
    }
  })
}

test.describe('axe (signed out)', () => {
  test.use({ signedIn: false, reducedMotion: 'reduce' })
  for (const path of ['/', '/auth', '/no-such-page']) {
    test(path, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('h1').first()).toBeVisible()
      await expectNoA11yViolations(page)
    })
  }
})

test.describe('keyboard', () => {
  test.use({ reducedMotion: 'reduce' })

  test('skip link is the first tab stop and focuses main', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('main h1')).toBeVisible()
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('main')).toBeFocused()
  })

  test('account menu follows the menu-button pattern', async ({ page }) => {
    await page.goto('/dashboard')
    const trigger = page.getByRole('button', { name: /account menu/i })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const menu = page.getByRole('menu', { name: 'Account' })
    await expect(menu.getByRole('menuitem', { name: 'Your profile' })).toBeFocused()
    await expectNoA11yViolations(page)
    await page.keyboard.press('End')
    await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: 'Your profile' })).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect(page.locator(':focus')).toHaveAttribute('role', 'menuitemradio')
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('dialog opened from a menu traps focus and restores it to the trigger (regression)', async ({ page }) => {
    await page.goto('/dashboard')
    const trigger = page.getByRole('button', { name: /^New$/ })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitem', { name: 'New repository' })).toBeFocused()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Repository name')).toBeFocused()
    await expectNoA11yViolations(page)
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab')
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('command palette is accessible', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('main h1')).toBeVisible()
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('combobox')).toBeFocused()
    await expectNoA11yViolations(page)
  })

  test('navigation updates the title and moves focus to main', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('link', { name: /^Explore/ }).first().click()
    await expect(page).toHaveTitle('Explore · DevForge')
    await expect(page.locator('main')).toBeFocused()
  })

  test('branch menu marks the current branch', async ({ page }) => {
    await page.goto(`/repo/${REPO.id}`)
    await expect(page).toHaveTitle('algo-playground · DevForge')
    const trigger = page.getByRole('button', { name: /main/ }).first()
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitemradio', { name: /main/ })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
  })
})
