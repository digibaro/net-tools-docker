import { expect, test } from '@playwright/test'

test('compare: two independent copies of a tool', async ({ page }) => {
  await page.goto('/ipv4-subnet-calculator?ip=10.0.0.1/8')
  await page.getByTestId('compare').click()
  await expect(page).toHaveURL(/a\.ip=10\.0\.0\.1/)
  const b = page.getByTestId('compare-b')
  await b.getByTestId('input').fill('172.16.0.1/12')
  await expect(page).toHaveURL(/b\.ip=172\.16\.0\.1/)
  await expect(page.getByTestId('compare-a').getByTestId('result')).toContainText('255.0.0.0')
  await expect(b.getByTestId('result')).toContainText('255.240.0.0')
  await page.getByTestId('compare-swap').click()
  await expect(page.getByTestId('compare-a').getByTestId('result')).toContainText('255.240.0.0')
})

test('history: a browser tool remembers its input', async ({ page }) => {
  await page.goto('/ipv4-subnet-calculator?ip=10.1.2.3/16')
  await page.waitForTimeout(5500)
  await page.goto('/ipv4-subnet-calculator?ip=192.0.2.1/24')
  await expect(page.getByTestId('history')).toContainText('10.1.2.3/16')
})
