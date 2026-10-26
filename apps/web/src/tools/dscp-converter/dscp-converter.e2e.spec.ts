import { expect, test } from '@playwright/test'

test('dscp-converter: ToS byte to PHB', async ({ page }) => {
  await page.goto('/dscp-converter?v=0xb8')
  await expect(page.getByTestId('result')).toContainText('EF')
})
