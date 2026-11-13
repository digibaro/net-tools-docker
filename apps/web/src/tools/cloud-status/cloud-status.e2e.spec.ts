import { expect, test } from '@playwright/test'

test('cloud-status: shows the state of the default feeds', async ({ page }) => {
  await page.goto('/cloud-status')
  await expect(page.getByTestId('summary')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('service-github')).toBeVisible()
  await expect(page.getByTestId('service-meta').getByRole('link')).toHaveAttribute('href', /metastatus/)
})
