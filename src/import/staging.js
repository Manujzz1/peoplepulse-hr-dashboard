import { MONTHLY_IMPORT_CATEGORIES } from './importSchemas'
import { mergePayrollReconciliationBatches } from './payrollReconciliation'

const canonical = (value) => String(value ?? '').trim().toUpperCase()
const monthOf = (row, category) => row.reportingMonth || (category === 'increments' ? String(row.effectiveDate || '').slice(0, 7) : '')

export function importRecordKey(category, row) {
  const employee = canonical(row.employeeId)
  const month = monthOf(row, category)
  if (['payroll', 'attendance', 'performance'].includes(category)) return `${category}:${employee}:${month}`
  if (category === 'leave') return `leave:${employee}:${month}:${canonical(row.leaveType)}`
  if (category === 'increments') return `increment:${employee}:${row.effectiveDate}`
  if (category === 'projectAllocation') return `allocation:${employee}:${month}:${canonical(row.projectId)}`
  if (category === 'recruitment') return `recruitment:${canonical(row.company)}:${canonical(row.requisitionId)}:${month}`
  if (category === 'contractManpower') return `contract:${canonical(row.company)}:${canonical(row.contractorId)}:${month}`
  if (category === 'hrBudget') return `budget:${month}:${canonical(row.company)}:${canonical(row.department)}:${canonical(row.budgetCategory)}`
  return ''
}

export function mergeImportStage(existing, incoming, category, mode = 'append') {
  if (!existing) return incoming
  if (!MONTHLY_IMPORT_CATEGORIES.includes(category)) return incoming

  const incomingMonths = new Set(incoming.rows.map((row) => monthOf(row, category)).filter(Boolean))
  if (!incomingMonths.size) throw new Error('No valid reporting period was found; existing staged rows were kept.')

  const existingRows = mode === 'replace-months'
    ? existing.rows.filter((row) => !incomingMonths.has(monthOf(row, category)))
    : existing.rows
  const existingKeys = new Set(existingRows.map((row) => importRecordKey(category, row)).filter(Boolean))
  if (mode === 'append') {
    const collisions = incoming.rows.filter((row) => existingKeys.has(importRecordKey(category, row)))
    if (collisions.length) {
      throw new Error(`${collisions.length} incoming row(s) match records already staged. Choose “Replace periods in this file” to replace only those reporting months.`)
    }
  }

  const rows = [...existingRows, ...incoming.rows]
  const replacedCompleteMonths = mode === 'replace-months'
    ? existing.completeMonths.filter((month) => !incomingMonths.has(month))
    : existing.completeMonths
  const completeMonths = [...new Set([...replacedCompleteMonths, ...incoming.completeMonths])].sort()
  const reconciliationBatches = category === 'payroll'
    ? mergePayrollReconciliationBatches(existing.reconciliationBatches, incoming.reconciliationBatches, [...incomingMonths], mode)
    : undefined
  return { ...incoming, rows, completeMonths, ...(category === 'payroll' ? { reconciliationBatches } : {}) }
}

export function rollbackImportStage(stagedImports, category, previousStage) {
  const restored = { ...stagedImports }
  if (previousStage) restored[category] = previousStage
  else delete restored[category]
  return restored
}
