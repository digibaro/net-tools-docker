import { expect, test } from '@playwright/test'

test('email-deliverability-report: grades a mail domain', async ({ page }) => {
  await page.goto('/email-deliverability-report?domain=nlnet.nl')
  await expect(page.getByTestId('grade')).toBeVisible({ timeout: 90_000 })
})
