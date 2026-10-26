import { expect, test } from '@playwright/test'

test('acl-analyzer: finds the shadowed rule and traces a packet', async ({ page }) => {
  await page.goto('/acl-analyzer')
  await expect(page.getByTestId('result')).toContainText('30 deny tcp any host 192.0.2.10 eq 443')
  await expect(page.getByTestId('trace')).toContainText('permit')
})
