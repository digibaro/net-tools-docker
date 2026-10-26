import { expect, test } from '@playwright/test'

test('poe-budget-calculator: flags an over-budget switch', async ({ page }) => {
  await page.goto('/poe-budget-calculator?budget=100')
  await expect(page.getByTestId('verdict')).toContainText('%')
})
