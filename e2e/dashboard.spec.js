import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function enterDemo(page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Continue to synthetic demo/ }).click()
  await expect(page.getByRole('heading', { name: 'Executive dashboard' })).toBeVisible()
  await expect(page.getByText(/Demo data loaded/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Period comparisons' })).toBeVisible()
  await expect(page.getByText('Quarter to date vs prior quarter')).toBeVisible()
  await page.locator('.topbar-source select').selectOption('imported')
  await expect(page.getByRole('button', { name: /Notifications, \d+ active alerts/ })).toBeVisible()
  await page.getByRole('button', { name: /Notifications, \d+ active alerts/ }).click()
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText('Imported data · 2025-12')
  await page.getByRole('button', { name: /Imported data · 2025-12/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Data Quality' })).toBeVisible()
  await page.getByRole('button', { name: 'Executive dashboard' }).click()
  await page.locator('.topbar-source select').selectOption('demo')
  await page.getByRole('button', { name: 'Open PeoplePulse help' }).click()
  await expect(page.getByRole('dialog', { name: 'Dashboard help' })).toBeVisible()
  await page.getByRole('button', { name: 'Open Data Import' }).click()
  await expect(page.getByRole('heading', { name: 'Data Import Centre' })).toBeVisible()
  await page.getByRole('button', { name: 'Executive dashboard' }).click()
  await page.getByRole('button', { name: 'Open PeoplePulse help' }).click()
  await page.getByRole('button', { name: 'View KPI definitions' }).click()
  await expect(page.locator('.kpi-definitions[open]')).toBeVisible()
}

test('demo entry, navigation, shared filters, and employee search work', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await enterDemo(page)
  await page.getByLabel('Financial year starts').selectOption('1')
  await expect(page.getByText(/January–December reporting-year-to-date/)).toBeVisible()
  await page.getByRole('button', { name: 'Attendance & leave' }).click()
  await expect(page.getByText(/January–December FYTD · synthetic allowance/)).toBeVisible()
  await page.getByLabel('Company').selectOption('Northstar Services')
  await expect(page.locator('.filter-result')).not.toContainText('120 employees')
  await page.getByLabel('Company').selectOption('All companies')

  await page.getByRole('button', { name: 'Employee Master' }).click()
  await expect(page.getByRole('heading', { name: 'Employee Master' }).first()).toBeVisible()
  await expect(page.locator('.table-count')).toContainText('120 of 120 records')
  await page.getByLabel('Search employee master').fill('SYN-001')
  await expect(page.getByRole('button', { name: 'Sample Employee 001' })).toBeVisible()
  await page.getByRole('button', { name: 'Sample Employee 001' }).click()
  await expect(page.getByRole('dialog', { name: 'Sample Employee 001' })).toBeVisible()
  await expect(page.getByText('Recorded history')).toBeVisible()

  await page.getByRole('button', { name: 'Close employee profile' }).click()
  await page.getByLabel('Department').selectOption('Engineering')
  await expect(page.locator('.filter-result')).not.toContainText('120 employees')
  await page.getByRole('button', { name: 'Workforce' }).click()
  await expect(page.getByRole('heading', { name: 'Workforce analytics' })).toBeVisible()
  await expect(page.getByLabel('Department', { exact: true })).toHaveValue('Engineering')
  await page.getByRole('button', { name: 'Project allocation' }).click()
  await expect(page.getByRole('heading', { name: 'Project allocation' }).first()).toBeVisible()
  const projectSelector = page.getByLabel('Project', { exact: true })
  const projectValue = await projectSelector.locator('option').nth(1).getAttribute('value')
  await projectSelector.selectOption(projectValue)
  await expect(page.locator('.table-count').last()).not.toContainText('120 records')
  await expect(page.locator('.metric-card').filter({ hasText: 'Active resources' })).toBeVisible()
  await page.getByRole('button', { name: 'Data Quality', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Data Quality' })).toBeVisible()
  await expect(page.getByText('In-memory source audit')).toBeVisible()
  await expect(page.getByText('Payroll control-total difference')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('CSV validation and in-memory staging complete without a network upload', async ({ page }) => {
  const externalRequests = []
  const pageErrors = []
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:5173')) externalRequests.push(request.url())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await enterDemo(page)
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
  await enterDemo(page)
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
