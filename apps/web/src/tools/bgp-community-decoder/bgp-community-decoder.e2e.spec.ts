import { expect, test } from '@playwright/test'

test('bgp-community-decoder: decodes the example', async ({ page }) => {
  await page.goto('/bgp-community-decoder')
  await expect(page.getByTestId('result')).toContainText('NO_EXPORT')
})
