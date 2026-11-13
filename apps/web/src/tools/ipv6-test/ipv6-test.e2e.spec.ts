import { expect, test } from '@playwright/test'

test('ipv6-test: scores this browser\'s connection', async ({ page }) => {
  await page.goto('/ipv6-test')
  await expect(page.getByTestId('score')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('verdict')).toBeVisible()
})
