import { expect, test } from '@playwright/test'

test('dns-ttl-planner: builds a plan and an ics file', async ({ page }) => {
  await page.goto('/dns-ttl-planner?ttl=3600&low=60')
  await expect(page.getByTestId('result').locator('tbody tr')).toHaveCount(5)
  const dl = page.waitForEvent('download')
  await page.getByTestId('ics').click()
  expect((await dl).suggestedFilename()).toBe('dns-ttl-plan.ics')
})
