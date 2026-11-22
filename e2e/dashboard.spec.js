import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createSampleRows } from '../scripts/adtl-sample-seed.mjs'

const browserErrors = new WeakMap()

test.beforeEach(async ({ page }) => {
  const errors = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.addInitScript(() => {
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason)
    })
  })
})

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), 'browser console and unhandled promise errors').toEqual([])
})

const fixtureHost = process.env.PEOPLEPULSE_E2E_API || 'https://peoplepulse-e2e.test'
const organization = { id: 'synthetic-org', organization_name: 'Synthetic test organization' }
const company = { id: 'synthetic-adtl', company_key: 'adtl', company_name: 'Alpha Design Technologies Pvt. Ltd.', organization_id: organization.id, currency_code: 'INR' }
const user = { id: 'synthetic-user', email: 'analyst@example.test', role: 'authenticated', aud: 'authenticated', is_anonymous: false }
const claims = Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800, aud: 'authenticated' })).toString('base64url')
const session = { access_token: 'eyJhbGciOiJIUzI1NiJ9.' + claims + '.eA', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user }
const fixture = Object.fromEntries(Object.entries(createSampleRows()).map(([table, rows]) =>
  [table, rows.map((row) => ({ company_id: company.id, ...row }))]))
Object.assign(fixture, { organizations: [organization], companies: [company],
  user_roles: [{ user_id: user.id, organization_id: organization.id, company_id: company.id, department_id: null, active: true, role_key: 'super_admin' }] })

async function openLogin(page) {
  await page.route(fixtureHost + '/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/auth/v1/token') return route.fulfill({ json: session })
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user })
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (url.pathname.startsWith('/rest/v1/') && route.request().method() === 'GET') {
      const rows = fixture[url.pathname.split('/').at(-1)] || []
      const offset = Number(url.searchParams.get('offset') || 0)
      const limit = Number(url.searchParams.get('limit') || rows.length)
      return route.fulfill({ json: rows.slice(offset, offset + limit) })
    }
    return route.fulfill({ status: 404 })
  })
  await page.goto('/')
}

async function enterWorkspace(page) {
  await openLogin(page)
  await page.getByLabel('Email address').fill(user.email)
  await page.getByLabel('Password').fill('synthetic-fixture-password')
  await page.getByRole('button', { name: 'Sign in securely' }).click()
  await expect(page.getByRole('heading', { name: 'Executive dashboard' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Period comparisons' })).toBeVisible()
  await expect(page.locator('.data-badge')).toHaveText('Temporary Sample Data')
}

test('populates the isolated Executive sample, labels exports and switches to scoped workspace data', async ({ page }, testInfo) => {
  test.skip(process.env.PEOPLEPULSE_SAMPLE_TEST !== '1', 'Requires the opt-in Preview build')
  await page.setViewportSize({ width: 1920, height: 1080 })
  await openLogin(page)
  await page.getByLabel('Email address').fill(user.email)
  await page.getByLabel('Password').fill('synthetic-fixture-password')
  await page.getByRole('button', { name: 'Sign in securely' }).click()
  const sample = page.locator('#executive-sample-preview')
  const notice = 'TEMPORARY SAMPLE DATA — NOT ACTUAL ADTL REPORTING'
  await expect(sample.getByText(notice, { exact: true })).toBeVisible()
  await expect(sample.locator('.exec-tile')).toHaveCount(8)
  await expect(sample.locator('.exec-tile[data-unavailable="true"]')).toHaveCount(0)
  await expect(sample.locator('.exec-unavailable')).toHaveCount(0)
  await expect(sample.locator('.exec-chart')).toHaveCount(4)
  for (const chart of await sample.locator('.exec-chart').all()) await expect(chart.locator('svg.recharts-surface').first()).toBeVisible()
  await expect(sample.getByRole('region', { name: 'HR Checklist table' }).locator('tbody td').first()).toHaveText(/Complete|Open|In progress|Overdue/)
  const screenshot = process.env.PEOPLEPULSE_EXECUTIVE_SCREENSHOT
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  if (screenshot) await page.screenshot({ path: screenshot.replace(/\.png$/, '-mobile.png'), fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 1366, height: 768 })
  await sample.getByLabel('Month', { exact: true }).selectOption('2025-06')
  await sample.getByLabel('As of date', { exact: true }).fill('2025-06-15')
  await sample.getByLabel('Department', { exact: true }).selectOption('Engineering')
  await sample.getByLabel('Location', { exact: true }).selectOption('Bengaluru')
  await sample.getByLabel('Employment type', { exact: true }).selectOption('Permanent')
  await expect(sample.getByText('Reporting period 2025-06-01 to 2025-06-15')).toBeVisible()
  await expect(sample.locator('.exec-tile').filter({ hasText: 'Active Employees' }).locator('strong')).toHaveText(/^\d{1,2}$/)
  for (const [label, extension] of [['CSV', 'csv'], ['Excel', 'xlsx'], ['PDF', 'pdf']]) {
    const [download] = await Promise.all([page.waitForEvent('download'), sample.getByRole('button', { name: label, exact: true }).click()])
    const path = testInfo.outputPath('executive-sample.' + extension)
    await download.saveAs(path)
    const bytes = await readFile(path)
    if (extension === 'csv') {
      expect(bytes.toString()).toContain(notice)
      expect(bytes.toString()).toContain('Engineering / Bengaluru / Permanent')
    } else if (extension === 'xlsx') {
      const cell = execFileSync(process.execPath, ['-e', 'const w = new (require("exceljs").Workbook)(); w.xlsx.readFile(process.argv[1]).then(() => console.log(w.worksheets[0].getCell("A1").value))', path], { encoding: 'utf8' })
      expect(cell.trim()).toBe(notice)
    } else {
      expect(bytes.toString('latin1')).toContain('NOT ACTUAL ADTL REPORTING')
    }
  }
  await page.evaluate(() => { window.print = () => document.body.setAttribute('data-print-invoked', 'true') })
  await sample.getByRole('button', { name: 'Print', exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-print-invoked', 'true')
  await page.emulateMedia({ media: 'print' })
  await expect(sample.getByText(notice, { exact: true })).toBeVisible()
  await page.emulateMedia({ media: 'screen' })
  await page.getByRole('button', { name: 'Show workspace data' }).click()
  await expect(sample).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Period comparisons' })).toBeVisible()
  await expect(page.getByLabel('Company', { exact: true })).toBeVisible()
})

test('requires an organization session and clears access on sign-out', async ({ page }) => {
  if (process.env.PEOPLEPULSE_EXECUTIVE_SCREENSHOT) await page.setViewportSize({ width: 1920, height: 1080 })
  await enterWorkspace(page)
  if (process.env.PEOPLEPULSE_EXECUTIVE_SCREENSHOT) await page.screenshot({ path: process.env.PEOPLEPULSE_EXECUTIVE_SCREENSHOT, fullPage: true, animations: 'disabled' })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Executive dashboard' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible()
  await expect(page.getByRole('button', { name: /demo/i })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Executive dashboard' })).toHaveCount(0)
})

test('shows scoped Executive analytics and explains unavailable sources at all viewport sizes', async ({ page }) => {
  await enterWorkspace(page)
  await page.getByLabel('Month', { exact: true }).selectOption('2025-12')
  await page.getByLabel('Company', { exact: true }).selectOption(company.company_name)
  const dashboard = page.locator('.executive-redesign')
  await expect(dashboard.locator('.exec-tile')).toHaveCount(8)
  const active = dashboard.locator('.exec-tile').filter({ has: page.getByRole('heading', { name: 'Active Employees' }) })
  await expect(active.locator('strong')).toHaveText('114')
  for (const title of ['Headcount by department', 'Employment status', 'Gender distribution', 'Recruitment versus exits', 'HR Checklist', 'Management Insights']) {
    await expect(dashboard.getByRole('heading', { name: title, exact: true })).toBeVisible()
  }
  await expect(dashboard.locator('.exec-tile').filter({ hasText: 'Training Hours' })).toContainText('Unavailable')
  await expect(dashboard.getByRole('columnheader', { name: 'Responsible owner' })).toBeVisible()
  await expect(dashboard.locator('.exec-panel').filter({ has: page.getByRole('heading', { name: 'Gender distribution' }) }).locator('svg.recharts-surface')).toBeVisible()
  for (const [width, height] of [[1920, 1080], [1366, 768], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height })
    await expect.poll(() => dashboard.evaluate((root) => (
      document.documentElement.scrollWidth === innerWidth && root.scrollWidth <= root.clientWidth
    ))).toBe(true)
  }
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.getByLabel('Department', { exact: true }).selectOption('Engineering')
  await expect(active.locator('strong')).toHaveText(/^[1-9]\d?$/)
  await expect(page.locator('.data-badge')).toHaveText('Temporary Sample Data')
})

test('renders Workforce for the ADTL December 2025 reporting period', async ({ page }) => {
  await enterWorkspace(page)
  await page.getByLabel('Month', { exact: true }).selectOption('2025-12')
  await page.getByLabel('Company', { exact: true }).selectOption(company.company_name)
  await page.getByRole('button', { name: 'Workforce', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Workforce directory' })).toBeVisible()
  for (const title of ['Department distribution', 'Workforce by location', 'Employee type', 'Exit profile', 'Headcount and attrition trend', 'Monthly workforce comparison']) {
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  }
  await expect(page.getByText('Attrition (%)', { exact: true })).toBeVisible()
  await expect(page.getByText('Joiners', { exact: true })).toBeVisible()
  await expect(page.getByText('Exits', { exact: true })).toBeVisible()
  await expect(page.locator('.filter-result')).toHaveText('114 employees')
  await page.getByLabel('Department', { exact: true }).selectOption('Engineering')
  await expect(page.locator('.filter-result')).toHaveText(/^[1-9]\d? employees$/)
  await expect(page.getByRole('heading', { name: 'Exit profile' })).toBeVisible()
  await expect(page.locator('.data-badge')).toHaveText('Temporary Sample Data')
})

test('loads labelled ADTL data for employee, payroll and attendance views and filters', async ({ page }) => {
  await enterWorkspace(page)
  await expect(page.locator('.workspace-copy strong')).toHaveText(company.company_name)
  for (const width of [1280, 1024, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  }
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByLabel('Company').selectOption(company.company_name)
  await page.getByRole('button', { name: 'Employee Master' }).click()
  await expect(page.locator('.table-count')).toContainText('120 of 120 records')
  await page.getByLabel('Search employee master').fill('SYN-ADTL-001')
  await expect(page.getByRole('button', { name: 'Sample Employee 001' })).toBeVisible()
  await page.getByRole('button', { name: 'Sample Employee 001' }).click()
  await expect(page.getByRole('dialog', { name: 'Sample Employee 001' })).toBeVisible()
  await page.getByRole('button', { name: 'Close employee profile' }).click()
  await page.getByLabel('Department', { exact: true }).selectOption('Engineering')
  await expect(page.locator('.filter-result')).not.toContainText('120 employees')
  await page.getByRole('button', { name: 'Payroll & CTC' }).click()
  await expect(page.getByText('Monthly gross salary', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Attendance & leave' }).click()
  await expect(page.getByText('Attendance percentage', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.data-badge')).toHaveText('Temporary Sample Data')
})

test('CSV validation and in-memory staging complete without a network upload', async ({ page }) => {
  const externalRequests = []
  const pageErrors = []
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/') && request.method() !== 'GET') externalRequests.push(request.url())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await enterWorkspace(page)
  await page.getByRole('button', { name: 'Data Import' }).click()
  await expect(page.getByRole('heading', { name: 'Data Import Centre' })).toBeVisible()
  await page.locator('input[type=file]').setInputFiles({
    name: 'synthetic-employees.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Employee ID,Employee Name,Department,Location,Employment Type,Hire Date\nSYN-E2E-001,Sample Browser Employee,Engineering,Bengaluru,Permanent,2025-01-15'),
  })
  await expect(page.locator('.import-validation-panel .import-summary-card').filter({ hasText: 'Valid rows' })).toContainText('1')
  await expect(page.getByText('Sample Browser Employee')).toBeVisible()
  await page.getByRole('button', { name: /Stage valid rows/ }).click()
  await expect(page.getByText(/1 total rows are now staged/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Import history' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'synthetic-employees.csv' })).toBeVisible()
  const templateDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Excel template' }).click()
  const template = await templateDownload
  const xlsxBuffer = await readFile(await template.path())
  await page.locator('input[type=file]').setInputFiles({
    name: 'synthetic-employees.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: xlsxBuffer,
  })
  await expect(page.getByLabel('Worksheet')).toContainText('Employee Master')
  await expect(page.getByText('Sample Employee A')).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: /Replace staged dataset/ }).click()
  await expect(page.getByText(/1 total rows are now staged/)).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Undo staging' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'synthetic-employees.xlsx' }).getByText('Rolled back')).toBeVisible()
  await expect(page.locator('.staged-panel .staged-item').filter({ hasText: 'Employee Master' })).toContainText('synthetic-employees.csv')

  await page.locator('.import-category').filter({ hasText: 'Payroll' }).click()
  await page.locator('input[type=file]').setInputFiles({
    name: 'synthetic-payroll.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Employee ID,Reporting Month,Monthly Gross Salary\nSYN-E2E-001,2025-12,50000'),
  })
  await expect(page.getByLabel('Source payroll control total 2025-12')).toBeVisible()
  await page.getByLabel('Source payroll control total 2025-12').fill('49000')
  await page.getByRole('button', { name: /Stage valid rows/ }).click()
  await expect(page.getByText(/1 total rows are now staged/)).toBeVisible()
  await page.getByRole('button', { name: 'Data Quality', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Data Quality' })).toBeVisible()
  await expect(page.getByText('Difference +INR 1,000')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Data Import' }).click()
  await expect(page.locator('.import-category').filter({ hasText: 'Employee Master' })).toContainText('0 staged rows')
  await expect(page.getByText(/No successful staging actions in this tab yet/)).toBeVisible()
  expect(externalRequests).toEqual([])
  expect(pageErrors).toEqual([])
})

test('report catalogue, CSV, Excel and PDF downloads, and mobile navigation are usable', async ({ page }, testInfo) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await enterWorkspace(page)
  await page.getByRole('button', { name: 'Reports Centre' }).click()
  await expect(page.getByRole('heading', { name: 'Management Reports Centre' })).toBeVisible()
  const reportSelect = page.locator('.report-controls select')
  await expect(reportSelect.locator('option')).toHaveCount(17)
  await reportSelect.selectOption('projectCost')
  await expect(page.getByRole('heading', { name: 'Project cost' })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toContain('project-cost')
  expect(await readFile(await download.path(), 'utf8')).toContain('Temporary Sample Data')

  const excelDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Excel' }).click()
  const excelDownload = await excelDownloadPromise
  expect(excelDownload.suggestedFilename()).toMatch(/\.xlsx$/)
  const excelPath = testInfo.outputPath(excelDownload.suggestedFilename())
  await excelDownload.saveAs(excelPath)
  expect((await readFile(excelPath)).subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))

  const pdfDownloadPromise = page.waitForEvent('download', { timeout: 10000 })
  await page.getByRole('button', { name: 'Download PDF' }).click()
  let pdfDownload
  try {
    pdfDownload = await pdfDownloadPromise
  } catch {
    throw new Error(`PDF export failed: ${await page.getByRole('alert').textContent().catch(() => 'no export error was shown')}`)
  }
  expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/)
  const pdfPath = testInfo.outputPath(pdfDownload.suggestedFilename())
  await pdfDownload.saveAs(pdfPath)
  expect((await readFile(pdfPath)).subarray(0, 5).toString()).toBe('%PDF-')
  await expect(page.getByRole('status')).toContainText('PDF downloaded')

  await reportSelect.selectOption('summary')
  const executivePdfPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF' }).click()
  const executivePdf = await executivePdfPromise
  const executivePdfPath = testInfo.outputPath(executivePdf.suggestedFilename())
  await executivePdf.saveAs(executivePdfPath)
  const executivePdfBytes = await readFile(executivePdfPath)
  expect(executivePdfBytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(executivePdfBytes.toString('latin1')).toContain('Monthly headcount trend')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible()
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(page.getByRole('button', { name: 'Attendance & leave' })).toBeVisible()
  await page.locator('.side-nav').getByRole('button', { name: 'Attendance & leave' }).click()
  await expect(page.getByRole('heading', { name: 'Attendance & leave' })).toBeVisible()
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(390)
  const tableScroll = page.locator('.table-scroll').last()
  expect(await tableScroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  expect(pageErrors).toEqual([])
})
