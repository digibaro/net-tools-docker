import { expect, test } from '@playwright/test'

test('Ctrl+K opens the command palette and runs a command', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+k')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await page.keyboard.type('about')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/about$/)
})

test('palette theme commands change the theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await page.getByTestId('search-open').click()
  await page.keyboard.type('dark')
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('menu toggle hides and shows the sidebar on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  const sidebar = page.getByTestId('sidebar')
  await expect(sidebar).toHaveClass(/n-layout-sider--collapsed/)
  await expect(sidebar).toHaveAttribute('inert', '')
  await page.getByTestId('menu-toggle').click()
  await expect(sidebar).not.toHaveClass(/n-layout-sider--collapsed/)
  await expect(sidebar).not.toHaveAttribute('inert')
  expect((await sidebar.boundingBox())?.width).toBeGreaterThan(200)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})

test('palette recognises a domain and offers tools and external sites', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+k')
  await page.keyboard.type('example.com')
  await expect(page.getByTestId('palette-target')).toContainText('example.com')
  await expect(page.getByTestId('palette-external').first()).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\?name=example\.com$/)
})

test('palette hides external sites when switched off in settings', async ({ page }) => {
  await page.goto('/settings')
  await page.getByTestId('external-links').click()
  await page.keyboard.press('Control+k')
  await page.keyboard.type('AS13335')
  await expect(page.getByTestId('palette-target')).toContainText('AS13335')
  await expect(page.getByTestId('palette-external')).toHaveCount(0)
})

test('tool page offers to look the target up elsewhere', async ({ page }) => {
  await page.goto('/ip-reputation?ip=192.0.2.1')
  await page.getByTestId('pivot').click()
  await expect(page.getByText('Shodan')).toBeVisible()
  await page.getByText('IP geolocation').click()
  await expect(page).toHaveURL(/\/ip-geolocation\?ip=192\.0\.2\.1$/)
})
