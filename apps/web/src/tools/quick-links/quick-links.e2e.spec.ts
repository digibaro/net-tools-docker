import { expect, test } from '@playwright/test'

test('quick-links: lists and filters links', async ({ page }) => {
  await page.goto('/quick-links')
  await expect(page.getByRole('link', { name: /Azure portal/ })).toBeVisible()
  await page.getByTestId('filter').locator('input').fill('cloudflare')
  await expect(page.getByRole('link', { name: /Azure portal/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Cloudflare/ })).toBeVisible()
})
