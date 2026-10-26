import { expect, test } from '@playwright/test'

test('config-diff: shows changed and reordered sections', async ({ page }) => {
  await page.goto('/config-diff')
  await expect(page.getByTestId('section')).toHaveCount(2)
  await expect(page.getByTestId('result')).toContainText('+ description uplink to isp')
})
