import { expect, test } from '@playwright/test'

test('opens a local sample session and provides responsive collapsible navigation', async ({ page }) => {
  test.skip(process.env.PEOPLEPULSE_STANDALONE_SAMPLE !== 'true', 'Requires the standalone sample build')
  const network = []
  const errors = []
  page.on('request', (request) => network.push(request.url()))
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  const signIn = page.getByRole('button', { name: 'Sign in to sample dashboard' })
  await expect(page.getByRole('link', { name: 'Go to organization sign-in' })).toHaveAttribute('href', 'https://peoplepulse-hr-dashboard.vercel.app')
  await signIn.click()
  await page.reload()
  const sample = page.getByRole('region', { name: 'Executive sample preview' })
  await expect(sample.getByText('TEMPORARY SAMPLE DATA — NOT ACTUAL ADTL REPORTING', { exact: true })).toBeVisible()
  await expect(sample.locator('.exec-tile')).toHaveCount(8)
  await expect(sample.locator('.exec-tile[data-unavailable="true"]')).toHaveCount(0)
  await expect(sample.locator('.exec-unavailable')).toHaveCount(0)
  await expect(sample.locator('.exec-chart')).toHaveCount(4)
  await expect(sample.getByRole('heading', { name: 'Recruitment funnel' })).toBeVisible()
  await expect(sample.getByRole('heading', { name: 'Employee engagement' })).toBeVisible()
  await expect(sample.getByRole('region', { name: 'HR Checklist table' }).locator('tbody td').first()).toHaveText(/Open|Overdue|Complete|In progress/)
  await page.getByRole('button', { name: 'Collapse menu' }).click()
  const expand = page.getByRole('button', { name: 'Expand menu' })
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expand.click()
  await expect(page.getByRole('button', { name: 'Collapse menu' })).toHaveAttribute('aria-expanded', 'true')

  for (const [width, height] of [[1920, 1080], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  }
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('link', { name: 'HR Checklist' }).click()
  await expect(page).toHaveURL(/#sample-checklist$/)
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false')
  await sample.getByLabel('Employee status as of date').selectOption('Exited')
  await expect(sample.locator('.exec-tile').filter({ hasText: 'Active Employees' }).locator('strong')).toHaveText('0')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(signIn).toBeVisible()
  expect(network.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true)
  expect(errors).toEqual([])
})
