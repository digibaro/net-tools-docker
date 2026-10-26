import { expect, test } from '@playwright/test'

test('wireless-link-calculator: link budget from the URL', async ({ page }) => {
  await page.goto('/wireless-link-calculator?f=5.8&d=10&tx=20&gtx=23&grx=23&loss=1&sens=-80')
  await expect(page.getByTestId('result')).toContainText('127.7 dB')
})
