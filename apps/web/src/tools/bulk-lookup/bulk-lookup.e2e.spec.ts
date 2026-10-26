import { expect, test } from '@playwright/test'

test('bulk-lookup: DNS for a list of names', async ({ page }) => {
  await page.goto('/bulk-lookup?targets=example.com%0Aexample.net%0Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.com')
  await page.getByTestId('run').click()
  await expect(page.getByTestId('result').locator('tbody tr')).toHaveCount(3)
  await expect(page.getByTestId('result')).toContainText('invalid')
})
