import { expect, test } from '@playwright/test'

test('latency-monitor: private targets are refused (SSRF)', async ({ page }) => {
  await page.goto('/latency-monitor?target=192.168.1.1')
  await page.getByTestId('run').click()
  await expect(page.getByTestId('api-error')).toContainText('TARGET_PRIVATE_DENIED')
})
