import { expect, test } from '@playwright/test'

test('provider-status: lists the providers without keys', async ({ page }) => {
  await page.goto('/provider-status')
  await expect(page.getByTestId('result')).toContainText('RIPEstat')
})
