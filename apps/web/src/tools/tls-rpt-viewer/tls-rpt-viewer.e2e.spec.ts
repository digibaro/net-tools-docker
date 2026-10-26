import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('tls-rpt-viewer: reads a gzip report in the browser', async ({ page }) => {
  await page.goto('/tls-rpt-viewer')
  await page.getByTestId('file').setInputFiles(join(import.meta.dirname, 'testdata', 'report.json.gz'))
  await expect(page.getByTestId('result')).toContainText('95')
  await expect(page.getByText('starttls-not-supported')).toBeVisible()
})
