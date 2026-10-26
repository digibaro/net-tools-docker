import { expect, test } from '@playwright/test'

test('subnet-overlap-checker: finds the overlaps in the example', async ({ page }) => {
  await page.goto('/subnet-overlap-checker')
  await expect(page.getByTestId('verdict')).toContainText('2')
})
