import { IMPORT_SCHEMAS } from './importSchemas'

const normalise = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')

export function autoMapColumns(category, headers) {
  const schema = IMPORT_SCHEMAS[category] || []
  return Object.fromEntries(schema.map((field) => {
    const candidates = [field.label, field.key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`), ...field.aliases].map(normalise)
    const header = headers.find((item) => candidates.includes(normalise(item.label)))
    return [field.key, header ? header.index : '']
  }))
}

export function findDuplicateMappings(mapping) {
  const used = new Map()
  Object.entries(mapping).forEach(([field, source]) => {
    if (source === '' || source == null) return
    const key = String(source)
    used.set(key, [...(used.get(key) || []), field])
  })
  return [...used.values()].filter((fields) => fields.length > 1).flat()
}

const empty = (value) => value == null || String(value).trim() === ''
const canonicalId = (value) => String(value ?? '').trim().toUpperCase()
const canonicalName = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const validId = (value) => /^[A-Za-z0-9][A-Za-z0-9._/-]{1,39}$/.test(String(value ?? '').trim())

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  const source = String(value ?? '').trim()
  let parts
  if ((parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(source))) {
    const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    return date.getFullYear() === Number(parts[1]) && date.getMonth() === Number(parts[2]) - 1 && date.getDate() === Number(parts[3]) ? date : null
  }
  if ((parts = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(source))) {
    const date = new Date(Number(parts[3]), Number(parts[1]) - 1, Number(parts[2]))
    return date.getFullYear() === Number(parts[3]) && date.getMonth() === Number(parts[1]) - 1 && date.getDate() === Number(parts[2]) ? date : null
  }
  return null
}

function monthValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
  const source = String(value ?? '').trim()
  let match = /^(\d{4})-(\d{2})$/.exec(source)
  if (!match) {
    const date = parseDate(source)
    if (date) return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    match = /^(\d{1,2})[/-](\d{4})$/.exec(source)
    if (match) {
      const month = Number(match[1])
      return month >= 1 && month <= 12 ? `${match[2]}-${String(month).padStart(2, '0')}` : null
    }
    return null
  }
  const month = Number(match[2])
  return month >= 1 && month <= 12 ? `${match[1]}-${String(month).padStart(2, '0')}` : null
}

function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const numeric = Number(String(value ?? '').trim().replace(/,/g, '').replace(/%$/, ''))
  return Number.isFinite(numeric) && String(value ?? '').trim() !== '' ? numeric : null
}

const issue = (rowNumber, field, message, severity = 'error') => ({ rowNumber, field, message, severity })

export function validateMappedRows({ category, headers, rows, mapping, context = {} }) {
  const schema = IMPORT_SCHEMAS[category] || []
  const issues = []
  const mappedRows = rows.map(({ rowNumber, values }) => {
    const record = { _rowNumber: rowNumber }
    schema.forEach((field) => {
      const sourceIndex = mapping[field.key]
      record[field.key] = sourceIndex === '' || sourceIndex == null ? '' : values[sourceIndex] ?? ''
    })
    if (values.length > headers.length && values.slice(headers.length).some((value) => !empty(value))) {
      issues.push(issue(rowNumber, 'Row', `This row has ${values.length} cells; the header has ${headers.length}.`))
    }
    return record
  })

  const duplicateGroups = new Map()
  mappedRows.forEach((record) => {
    let key = null
    if (category === 'employeeMaster') key = `employee:${canonicalId(record.employeeId)}`
    if (category === 'employeeHistory') key = `employee-history:${canonicalId(record.employeeId)}:${record.effectiveFrom}`
    if (category === 'projectMaster') key = `project:${canonicalId(record.projectId)}`
    if (category === 'departmentMaster') key = `department:${canonicalId(record.departmentId)}`
    if (category === 'locationMaster') key = `location:${canonicalId(record.locationId)}`
    if (category === 'exitRecords') key = `exit:${canonicalId(record.employeeId)}:${record.exitDate}`
    if (['payroll', 'attendance', 'leave', 'performance'].includes(category)) key = `${category}:${canonicalId(record.employeeId)}:${monthValue(record.reportingMonth) || record.reportingMonth}${category === 'leave' ? `:${canonicalId(record.leaveType)}` : ''}`
    if (category === 'increments') key = `increment:${canonicalId(record.employeeId)}:${record.effectiveDate}`
    if (category === 'projectAllocation') key = `allocation:${canonicalId(record.employeeId)}:${monthValue(record.reportingMonth) || record.reportingMonth}:${canonicalId(record.projectId)}`
    if (category === 'recruitment') key = `recruitment:${canonicalId(record.company)}:${canonicalId(record.requisitionId)}:${monthValue(record.reportingMonth) || record.reportingMonth}`
    if (category === 'contractManpower') key = `contract:${canonicalId(record.company)}:${canonicalId(record.contractorId)}:${monthValue(record.reportingMonth) || record.reportingMonth}`
    if (category === 'hrBudget') key = `budget:${monthValue(record.reportingMonth) || record.reportingMonth}:${canonicalId(record.company)}:${canonicalId(record.department)}:${canonicalId(record.budgetCategory)}`
    if (!key || key.endsWith(':')) return
    duplicateGroups.set(key, [...(duplicateGroups.get(key) || []), record._rowNumber])
  })
  duplicateGroups.forEach((rowNumbers, key) => {
    if (rowNumbers.length > 1) rowNumbers.forEach((rowNumber) => issues.push(issue(rowNumber, 'Duplicate', `Duplicate record for ${key.split(':').slice(1).join(' / ')}.`)))
  })

  if (category === 'employeeHistory') {
    const historiesByEmployee = new Map()
    mappedRows.forEach((record) => {
      if (!record.employeeId || !parseDate(record.effectiveFrom)) return
      const entry = { rowNumber: record._rowNumber, start: parseDate(record.effectiveFrom).toISOString().slice(0, 10), end: empty(record.effectiveTo) ? '' : parseDate(record.effectiveTo)?.toISOString().slice(0, 10) }
      historiesByEmployee.set(canonicalId(record.employeeId), [...(historiesByEmployee.get(canonicalId(record.employeeId)) || []), entry])
    })
    historiesByEmployee.forEach((entries) => {
      const sorted = [...entries].sort((left, right) => left.start.localeCompare(right.start))
      for (let index = 1; index < sorted.length; index += 1) {
        const previous = sorted[index - 1]
        const current = sorted[index]
        if (!previous.end || previous.end >= current.start) {
          issues.push(issue(previous.rowNumber, 'Effective To', 'This effective period overlaps a later history row for the same employee.'))
          issues.push(issue(current.rowNumber, 'Effective From', 'This effective period overlaps an earlier history row for the same employee.'))
        }
      }
    })
  }

  const allocationTotals = new Map()
  mappedRows.forEach((record) => {
    if (category !== 'projectAllocation') return
    const month = monthValue(record.reportingMonth)
    const allocation = numericValue(record.allocationPercentage)
    if (!month || !validId(record.employeeId) || allocation == null) return
    const key = `${canonicalId(record.employeeId)}:${month}`
    allocationTotals.set(key, [...(allocationTotals.get(key) || []), { rowNumber: record._rowNumber, allocation }])
  })
  allocationTotals.forEach((entries) => {
    if (entries.reduce((sum, entry) => sum + entry.allocation, 0) > 100) {
      entries.forEach(({ rowNumber }) => issues.push(issue(rowNumber, 'Allocation Percentage', 'Combined project allocation for this employee-month exceeds 100%.')))
    }
  })

  const employeeIds = context.employeeIds == null ? null : new Set([...context.employeeIds].map(canonicalId))
  const employeeRecords = context.employeeRecords == null ? null : new Map(context.employeeRecords.map((employee) => [canonicalId(employee.employeeId), employee]))
  const projectIds = context.projectIds == null ? null : new Set([...context.projectIds].map(canonicalId))
  const departmentNames = context.departmentNames == null ? null : new Set([...context.departmentNames].map(canonicalName))
  const locationNames = context.locationNames == null ? null : new Set([...context.locationNames].map(canonicalName))
  const validRecords = []
  mappedRows.forEach((record) => {
    const rowNumber = record._rowNumber
    let rowHasError = issues.some((entry) => entry.rowNumber === rowNumber && entry.severity === 'error')
    schema.forEach((field) => {
      const value = record[field.key]
      if (field.required && (mapping[field.key] === '' || mapping[field.key] == null)) {
        issues.push(issue(rowNumber, field.label, 'Required field is not mapped.'))
        rowHasError = true
        return
      }
      if (empty(value)) {
        if (field.required) {
          issues.push(issue(rowNumber, field.label, 'Required value is missing.'))
          rowHasError = true
        }
        return
      }
      if (field.type === 'id' && !validId(value)) {
        issues.push(issue(rowNumber, field.label, 'Use 2–40 letters, numbers, dots, underscores, slashes or hyphens; do not start with punctuation.'))
        rowHasError = true
      } else if (field.type === 'enum') {
        const selected = field.values.find((option) => option.toLowerCase() === String(value).trim().toLowerCase())
        if (!selected) {
          issues.push(issue(rowNumber, field.label, `Choose one of: ${field.values.join(', ')}.`))
          rowHasError = true
        } else record[field.key] = selected
      } else if (field.type === 'date') {
        const parsed = parseDate(value)
        if (!parsed) {
          issues.push(issue(rowNumber, field.label, 'Enter a valid date (YYYY-MM-DD or MM/DD/YYYY).'))
          rowHasError = true
        } else record[field.key] = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
      } else if (field.type === 'month') {
        const parsed = monthValue(value)
        if (!parsed) {
          issues.push(issue(rowNumber, field.label, 'Enter a valid reporting month (YYYY-MM or a valid date).'))
          rowHasError = true
        } else record[field.key] = parsed
      } else if (['nonNegative', 'integer', 'percentage', 'score'].includes(field.type)) {
        const parsed = numericValue(value)
        if (parsed == null) {
          issues.push(issue(rowNumber, field.label, 'Enter a valid number.'))
          rowHasError = true
        } else if (['nonNegative', 'integer'].includes(field.type) && parsed < 0) {
          issues.push(issue(rowNumber, field.label, 'Negative values are not allowed.'))
          rowHasError = true
        } else if (field.type === 'integer' && !Number.isInteger(parsed)) {
          issues.push(issue(rowNumber, field.label, 'Enter a whole number of days.'))
          rowHasError = true
        } else if (field.type === 'percentage' && (parsed < 0 || parsed > 100)) {
          issues.push(issue(rowNumber, field.label, 'Enter a percentage from 0 to 100.'))
          rowHasError = true
        } else if (field.type === 'score' && (parsed < 0 || parsed > 5)) {
          issues.push(issue(rowNumber, field.label, 'PMS score must be between 0 and 5.'))
          rowHasError = true
        } else record[field.key] = parsed
      }
    })

    if (category === 'employeeMaster' && record.hireDate && record.exitDate && record.exitDate < record.hireDate) {
      issues.push(issue(rowNumber, 'Exit Date', 'Exit date cannot be earlier than hire date.'))
      rowHasError = true
    }
    if (category === 'employeeHistory' && record.effectiveFrom && record.effectiveTo && record.effectiveTo < record.effectiveFrom) {
      issues.push(issue(rowNumber, 'Effective To', 'Effective To cannot be earlier than Effective From.'))
      rowHasError = true
    }
    if (category === 'employeeHistory' && !['department', 'location', 'designation', 'grade', 'employmentType', 'managerEmployeeId', 'costCentre'].some((field) => !empty(record[field]))) {
      issues.push(issue(rowNumber, 'History Values', 'Provide at least one employee attribute for this effective-dated record.'))
      rowHasError = true
    }
    if (category === 'attendance') {
      const attendancePercentage = numericValue(record.attendancePercentage)
      const hasWorkingDays = Number.isFinite(record.workingDays)
      const hasPresentDays = Number.isFinite(record.presentDays)
      const hasDayRatio = hasWorkingDays && hasPresentDays && record.workingDays > 0
      if (attendancePercentage == null && !hasDayRatio) {
        issues.push(issue(rowNumber, 'Attendance Percentage', 'Provide Attendance Percentage or both Present Days and Working Days.'))
        rowHasError = true
      } else if (hasDayRatio) {
        if (record.presentDays > record.workingDays) {
          issues.push(issue(rowNumber, 'Present Days', 'Present days cannot exceed working days.'))
          rowHasError = true
        } else {
          const calculatedPercentage = record.presentDays / record.workingDays * 100
          if (attendancePercentage == null) {
            record.attendancePercentage = Math.round(calculatedPercentage * 100) / 100
            issues.push(issue(rowNumber, 'Attendance Percentage', 'Calculated from Present Days ÷ Working Days.', 'warning'))
          } else if (Math.abs(attendancePercentage - calculatedPercentage) > 0.5) {
            issues.push(issue(rowNumber, 'Attendance Percentage', `Reported percentage differs from Present Days ÷ Working Days (${calculatedPercentage.toFixed(2)}%).`))
            rowHasError = true
          } else record.attendancePercentage = Math.round(calculatedPercentage * 100) / 100
        }
      }

      if (Number.isFinite(record.calendarDays) && Number.isFinite(record.workingDays) && record.workingDays > record.calendarDays) {
        issues.push(issue(rowNumber, 'Working Days', 'Working days cannot exceed eligible calendar days.'))
        rowHasError = true
      }
      if (Number.isFinite(record.calendarDays) && Number.isFinite(record.payableDays) && record.payableDays > record.calendarDays) {
        issues.push(issue(rowNumber, 'Payable Days', 'Payable days cannot exceed eligible calendar days.'))
        rowHasError = true
      }
      if ([record.calendarDays, record.workingDays, record.weeklyOffDays, record.holidayDays].every(Number.isFinite)) {
        const classifiedDays = record.workingDays + record.weeklyOffDays + record.holidayDays
        if (classifiedDays > record.calendarDays) {
          issues.push(issue(rowNumber, 'Calendar Days', 'Working days, weekly offs, and holidays must reconcile exactly to eligible calendar days.'))
          rowHasError = true
        } else if (classifiedDays < record.calendarDays) {
          issues.push(issue(rowNumber, 'Calendar Days', `Calendar days do not reconcile: ${record.calendarDays - classifiedDays} eligible day(s) are not classified as working days, weekly offs, or holidays.`))
          rowHasError = true
        }
      }
      if (hasWorkingDays && (hasPresentDays || ['paidLeaveDays', 'unpaidLeaveDays'].some((field) => Number.isFinite(record[field])))) {
        const accountedWorkDays = (hasPresentDays ? record.presentDays : 0)
          + (Number.isFinite(record.paidLeaveDays) ? record.paidLeaveDays : 0)
          + (Number.isFinite(record.unpaidLeaveDays) ? record.unpaidLeaveDays : 0)
        if (accountedWorkDays > record.workingDays) {
          issues.push(issue(rowNumber, 'Working Days', 'Present, paid-leave, and unpaid-leave days cannot exceed working days.'))
          rowHasError = true
        }
      }
    }
    if (category === 'leave' && ['openingBalance', 'daysCredited', 'daysAvailed', 'closingBalance'].every((field) => record[field] !== '' && record[field] != null)) {
      const expectedClosing = Number(record.openingBalance) + Number(record.daysCredited) - Number(record.daysAvailed)
      if (Math.abs(expectedClosing - Number(record.closingBalance)) > 0.01) {
        issues.push(issue(rowNumber, 'Closing Leave Balance', `Expected ${expectedClosing.toFixed(2)} from opening balance + credited − availed days.`))
        rowHasError = true
      }
    }
    if (category === 'recruitment') {
      if (Number.isFinite(record.approvedPositions) && Number.isFinite(record.filledPositions) && record.filledPositions > record.approvedPositions) {
        issues.push(issue(rowNumber, 'Filled Positions', 'Filled positions cannot exceed approved positions.'))
        rowHasError = true
      }
      if (!empty(record.offersAccepted) && !empty(record.offersExtended) && Number(record.offersAccepted) > Number(record.offersExtended)) {
        issues.push(issue(rowNumber, 'Offers Accepted', 'Accepted offers cannot exceed offers extended.'))
        rowHasError = true
      }
      if (record.joiningDate && record.requisitionDate && record.joiningDate < record.requisitionDate) {
        issues.push(issue(rowNumber, 'Joining Date', 'Joining date cannot be earlier than requisition date.'))
        rowHasError = true
      }
      if (record.offerDate && record.requisitionDate && record.offerDate < record.requisitionDate) {
        issues.push(issue(rowNumber, 'Offer Date', 'Offer date cannot be earlier than requisition date.'))
        rowHasError = true
      }
      const acceptedAfter = record.offerDate || record.requisitionDate
      if (record.offerAcceptedDate && acceptedAfter && record.offerAcceptedDate < acceptedAfter) {
        issues.push(issue(rowNumber, 'Offer Accepted Date', 'Offer acceptance cannot be earlier than the offer date or requisition date.'))
        rowHasError = true
      }
      if (record.joiningDate && record.offerAcceptedDate && record.joiningDate < record.offerAcceptedDate) {
        issues.push(issue(rowNumber, 'Joining Date', 'Joining date cannot be earlier than offer acceptance.'))
        rowHasError = true
      }
      if (record.offerAcceptedDate && !empty(record.offersAccepted) && Number(record.offersAccepted) === 0) {
        issues.push(issue(rowNumber, 'Offer Accepted Date', 'An offer acceptance date cannot be recorded when accepted offers are zero.'))
        rowHasError = true
      }
    }
    if (category === 'contractManpower' && record.contractEndDate && record.contractStartDate && record.contractEndDate < record.contractStartDate) {
      issues.push(issue(rowNumber, 'Contract End Date', 'Contract end date cannot be earlier than contract start date.'))
      rowHasError = true
    }
    if (category === 'increments' && Number.isFinite(record.currentCtc) && Number.isFinite(record.revisedCtc)) {
      if (record.revisedCtc < record.currentCtc) {
        issues.push(issue(rowNumber, 'Revised Annual CTC', 'Revised CTC cannot be lower than current CTC for an increment record.'))
        rowHasError = true
      } else if (Number.isFinite(record.incrementPercentage) && record.currentCtc > 0) {
        const calculated = (record.revisedCtc - record.currentCtc) / record.currentCtc * 100
        if (Math.abs(calculated - record.incrementPercentage) > 0.1) {
          issues.push(issue(rowNumber, 'Increment Percentage', `Reported percentage differs from the CTC change (${calculated.toFixed(2)}%).`, 'warning'))
        }
      }
    }

    if (record.employeeId && ['employeeHistory', 'payroll', 'attendance', 'leave', 'performance', 'increments', 'projectAllocation', 'exitRecords'].includes(category)) {
      if (employeeIds && !employeeIds.has(canonicalId(record.employeeId))) {
        issues.push(issue(rowNumber, 'Employee ID', 'Employee ID is not present in the staged Employee Master.'))
        rowHasError = true
      } else if (!employeeIds) issues.push(issue(rowNumber, 'Employee ID', 'Reference not checked; stage Employee Master to verify this employee.', 'warning'))
    }
    if (category === 'projectAllocation' && record.projectId) {
      if (projectIds && !projectIds.has(canonicalId(record.projectId))) {
        issues.push(issue(rowNumber, 'Project ID', 'Project ID is not present in the staged Project Master.'))
        rowHasError = true
      } else if (!projectIds) issues.push(issue(rowNumber, 'Project ID', 'Reference not checked; stage Project Master to verify this project.', 'warning'))
    }
    if (record.department && ['employeeMaster', 'employeeHistory', 'recruitment', 'contractManpower', 'hrBudget'].includes(category) && departmentNames) {
      if (!departmentNames.has(canonicalName(record.department))) {
        issues.push(issue(rowNumber, 'Department', 'Department is not present in the staged Department Master.'))
        rowHasError = true
      }
    }
    if (record.location && ['employeeMaster', 'employeeHistory', 'contractManpower'].includes(category) && locationNames) {
      if (!locationNames.has(canonicalName(record.location))) {
        issues.push(issue(rowNumber, 'Location', 'Location is not present in the staged Location Master.'))
        rowHasError = true
      }
    }
    if (record.managerEmployeeId && category === 'employeeHistory' && employeeIds && !employeeIds.has(canonicalId(record.managerEmployeeId))) {
      issues.push(issue(rowNumber, 'Manager Employee ID', 'Manager Employee ID is not present in the staged Employee Master.'))
      rowHasError = true
    } else if (record.managerEmployeeId && category === 'employeeHistory' && canonicalId(record.managerEmployeeId) === canonicalId(record.employeeId)) {
      issues.push(issue(rowNumber, 'Manager Employee ID', 'An employee cannot be their own reporting manager.'))
      rowHasError = true
    } else if (record.managerEmployeeId && category === 'employeeHistory' && !employeeIds) {
      issues.push(issue(rowNumber, 'Manager Employee ID', 'Manager reference not checked; stage Employee Master to verify this manager.', 'warning'))
    }
    if (category === 'employeeHistory' && employeeRecords) {
      const employee = employeeRecords.get(canonicalId(record.employeeId))
      if (employee && record.effectiveFrom < employee.hireDate) {
        issues.push(issue(rowNumber, 'Effective From', 'Employee history cannot start before the employee hire date.'))
        rowHasError = true
      }
      if (employee?.exitDate && record.effectiveFrom > employee.exitDate) {
        issues.push(issue(rowNumber, 'Effective From', 'Employee history cannot start after the employee exit date.'))
        rowHasError = true
      }
    }
    recordHasError(rowHasError, record, validRecords)
  })

  const rejectedRows = new Set(issues.filter((entry) => entry.severity === 'error').map((entry) => entry.rowNumber))
  const warningCount = issues.filter((entry) => entry.severity === 'warning').length
  const cleanRecords = validRecords.filter((record) => !rejectedRows.has(record._rowNumber))
  return {
    rows: mappedRows,
    validRows: cleanRecords,
    issues,
    summary: { totalRows: rows.length, validRows: cleanRecords.length, rejectedRows: rejectedRows.size, warningCount },
  }
}

function recordHasError(hasError, record, validRecords) {
  if (!hasError) validRecords.push(record)
}
