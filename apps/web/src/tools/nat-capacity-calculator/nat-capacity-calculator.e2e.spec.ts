import { expect, test } from '@playwright/test'

test('nat-capacity-calculator: deterministic port block', async ({ page }) => {
  await page.goto('/nat-capacity-calculator?n=63')
  await expect(page.getByTestId('slot')).toContainText('1024')
})
