import { expect, test } from '@playwright/test'

test('dns-health-report: grades a zone', async ({ page }) => {
  await page.goto('/dns-health-report?zone=example.com')
  await expect(page.getByTestId('grade')).toBeVisible({ timeout: 60_000 })
})
