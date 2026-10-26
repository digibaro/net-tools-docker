import { expect, test } from '@playwright/test'

test('prefix-list-tester: evaluates the example', async ({ page }) => {
  await page.goto('/prefix-list-tester')
  await expect(page.getByTestId('result')).toContainText('seq 20 permit 198.51.100.0/22 ge 23 le 24')
})
