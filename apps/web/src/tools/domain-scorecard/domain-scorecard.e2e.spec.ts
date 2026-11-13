import { expect, test } from '@playwright/test'

test('domain-scorecard: grades a domain in three sections', async ({ page }) => {
  await page.goto('/domain-scorecard?domain=example.com')
  await expect(page.getByTestId('overall')).toBeVisible({ timeout: 120_000 })
  for (const id of ['web', 'mail', 'dns'])
    await expect(page.getByTestId(`section-${id}`)).toBeVisible()
})
