import { expect, test } from '@playwright/test'

test('report-bundle: collects a result table', async ({ page }) => {
  await page.goto('/port-reference?q=ssh')
  await page.getByTestId('add-to-report').first().click()
  await page.goto('/report-bundle')
  await expect(page.getByTestId('report-item')).toHaveCount(1)
  await expect(page.getByTestId('report-item')).toContainText('22')
  await page.getByTestId('remove').click()
  await expect(page.getByTestId('empty')).toBeVisible()
})
