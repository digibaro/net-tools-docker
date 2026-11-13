import { expect, test } from '@playwright/test'

test('m365-domain-check: checks a Microsoft 365 domain', async ({ page }) => {
  await page.goto('/m365-domain-check?domain=microsoft.com')
  await expect(page.getByTestId('tenant')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('records')).toContainText('autodiscover.microsoft.com')
})
