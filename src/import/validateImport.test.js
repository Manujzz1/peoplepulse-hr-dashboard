import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { parseCsv, parseImportFile } from './fileParsers'
import { autoMapColumns, findDuplicateMappings, validateMappedRows } from './validateImport'
import { IMPORT_SCHEMAS, MAX_IMPORT_BYTES, SAMPLE_ROWS } from './importSchemas'

const headersFor = (category) => IMPORT_SCHEMAS[category].map((field, index) => ({ index, label: field.label }))
const mappingFor = (category) => Object.fromEntries(IMPORT_SCHEMAS[category].map((field, index) => [field.key, index]))
const row = (rowNumber, values) => ({ rowNumber, values })

describe('CSV parsing', () => {
  it('handles escaped quotes, commas, CRLF, and quoted newlines', () => {
    expect(parseCsv('Name,Note\r\n"Sample, Employee","Said ""hello"""\r\n"Second\nEmployee",ok')).toEqual([
      ['Name', 'Note'],
      ['Sample, Employee', 'Said "hello"'],
      ['Second\nEmployee', 'ok'],
    ])
  })

  it('rejects unclosed and malformed quoting', () => {
    expect(() => parseCsv('Name,Note\n"Broken,value')).toThrow(/unclosed/i)
    expect(() => parseCsv('Name,Note\nBad" quote,value')).toThrow(/quote inside/i)
    expect(() => parseCsv('Name,Note\n"ok"x,value')).toThrow(/after a closing quote/i)
  })

  it('auto-maps common header variants and reports duplicate source columns', () => {
    const headers = [{ index: 0, label: 'Emp_Code' }, { index: 1, label: 'Gross Pay' }, { index: 2, label: 'Month' }]
    expect(autoMapColumns('payroll', headers)).toMatchObject({ employeeId: 0, reportingMonth: 2, monthlyGrossSalary: 1, annualCtc: '', monthlyBasic: '', monthlyHra: '', monthlyOtherAllowances: '', employerPf: '', employerEsic: '', gratuity: '', variablePay: '', incentives: '', arrears: '', overtime: '' })
    expect(findDuplicateMappings({ employeeId: 0, projectId: 0, reportingMonth: 1 })).toEqual(['employeeId', 'projectId'])
  })
})

describe('import validation', () => {
  it('normalises employee dates and rejects missing or malformed employee IDs', () => {
    const result = validateMappedRows({
      category: 'employeeMaster', headers: headersFor('employeeMaster'), mapping: mappingFor('employeeMaster'),
      rows: [
        row(2, ['SYN-100', 'Sample One', 'Engineering', 'Pune', 'Permanent', 'Not specified', '2025-02-28', '']),
        row(3, ['', 'Sample Two', 'People', 'Mumbai', 'Permanent', 'Not specified', '2025-02-30', '']),
        row(4, ['?', 'Sample Three', 'Sales', 'Delhi', 'Contract', 'Not specified', 'bad date', '']),
      ],
    })
    expect(result.summary).toEqual({ totalRows: 3, validRows: 1, rejectedRows: 2, warningCount: 0 })
    expect(result.validRows[0].hireDate).toBe('2025-02-28')
    expect(result.issues.map((item) => item.field)).toContain('Employee ID')
    expect(result.issues.map((item) => item.field)).toContain('Hire Date')
  })

  it('rejects an exit date earlier than the hire date', () => {
    const result = validateMappedRows({
      category: 'employeeMaster', headers: headersFor('employeeMaster'), mapping: mappingFor('employeeMaster'),
      rows: [row(2, ['SYN-202', 'Sample Employee', 'Operations', 'Pune', 'Permanent', 'Not specified', '2025-06-10', '2025-06-09'])],
    })
    expect(result.summary.rejectedRows).toBe(1)
    expect(result.issues.some((item) => item.field === 'Exit Date' && item.message.includes('earlier than hire'))).toBe(true)
  })

  it('validates effective-dated employee history and rejects overlapping periods', () => {
    const input = {
      category: 'employeeHistory', headers: headersFor('employeeHistory'), mapping: mappingFor('employeeHistory'),
      context: { employeeIds: ['EMP-101'] },
      rows: [
        row(2, ['EMP-101', '2025-01-01', '2025-01-31', 'Engineering', 'Pune', 'Analyst', 'G1', 'Permanent', '', 'CC-1']),
        row(3, ['EMP-101', '2025-02-01', '', 'Sales', 'Mumbai', 'Senior Analyst', 'G2', 'Permanent', '', 'CC-1']),
      ],
    }
    expect(validateMappedRows(input).summary).toEqual({ totalRows: 2, validRows: 2, rejectedRows: 0, warningCount: 0 })

    const overlapping = validateMappedRows({
      ...input,
      rows: [
        row(2, ['EMP-101', '2025-01-01', '2025-02-15', 'Engineering', 'Pune', 'Analyst', 'G1', 'Permanent', '', 'CC-1']),
        row(3, ['EMP-101', '2025-02-01', '', 'Sales', 'Mumbai', 'Senior Analyst', 'G2', 'Permanent', '', 'CC-1']),
      ],
    })
    expect(overlapping.summary.rejectedRows).toBe(2)
    expect(overlapping.issues.filter((item) => item.message.includes('overlaps')).length).toBe(2)
  })

  it('rejects negative payroll and duplicate employee-month records', () => {
    const result = validateMappedRows({
      category: 'payroll', headers: headersFor('payroll'), mapping: mappingFor('payroll'),
      context: { employeeIds: ['EMP-101', 'EMP-102', 'EMP-103'] },
      rows: [
        row(2, ['EMP-101', '2025-01', 80000, 1104000]),
        row(3, ['EMP-101', '2025-01', 81000, 1117800]),
        row(4, ['EMP-102', '2025-13', 82000, 1131600]),
        row(5, ['EMP-103', '2025-02', -500, 0]),
        row(6, ['', '2025-02', 50000, 690000]),
      ],
    })
    expect(result.summary).toEqual({ totalRows: 5, validRows: 0, rejectedRows: 5, warningCount: 0 })
    expect(result.issues.some((item) => item.field === 'Duplicate')).toBe(true)
    expect(result.issues.some((item) => item.message.includes('Negative'))).toBe(true)
    expect(result.issues.some((item) => item.message.includes('reporting month'))).toBe(true)
  })

  it('warns when employee references cannot be checked and errors on known invalid references', () => {
    const input = {
      category: 'attendance', headers: headersFor('attendance'), mapping: mappingFor('attendance'),
      rows: [row(2, ['EMP-404', '2025-01', '96', 0, 1])],
    }
    expect(validateMappedRows(input).summary.warningCount).toBe(1)
    const checked = validateMappedRows({ ...input, context: { employeeIds: ['EMP-101'] } })
    expect(checked.summary.rejectedRows).toBe(1)
    expect(checked.issues.some((item) => item.message.includes('not present'))).toBe(true)
  })

  it('validates integer day fields, percentages, project references, duplicates, and allocation totals', () => {
    const result = validateMappedRows({
      category: 'projectAllocation', headers: headersFor('projectAllocation'), mapping: mappingFor('projectAllocation'),
      context: { employeeIds: ['EMP-101'], projectIds: ['PROJ-1', 'PROJ-2'] },
      rows: [
        row(2, ['EMP-101', '2025-01', 'PROJ-1', 70, 50000]),
        row(3, ['EMP-101', '2025-01', 'PROJ-2', 40, 30000]),
        row(4, ['EMP-101', '2025-01', 'PROJ-2', 10, 8000]),
        row(5, ['EMP-101', '2025-02', 'UNKNOWN', 120, 1000]),
      ],
    })
    expect(result.summary.rejectedRows).toBe(4)
    expect(result.issues.some((item) => item.message.includes('exceeds 100%'))).toBe(true)
    expect(result.issues.some((item) => item.message.includes('Duplicate record'))).toBe(true)
    expect(result.issues.some((item) => item.message.includes('not present in the staged Project Master'))).toBe(true)
    expect(result.issues.some((item) => item.message.includes('percentage from 0 to 100'))).toBe(true)

    const attendance = validateMappedRows({
      category: 'attendance', headers: headersFor('attendance'), mapping: mappingFor('attendance'),
      rows: [row(2, ['EMP-101', '2025-01', 99, 1.5, 0])], context: { employeeIds: ['EMP-101'] },
    })
    expect(attendance.validRows[0].lopDays).toBe(1.5)
  })

  it('derives attendance percentage from day totals and reconciles the calendar', () => {
    const values = ['EMP-101', '2025-01', '', 0, 1, 31, 22, 21, 8, 1, 1, 0, 30]
    const valid = validateMappedRows({
      category: 'attendance', headers: headersFor('attendance'), mapping: mappingFor('attendance'),
      rows: [row(2, values)], context: { employeeIds: ['EMP-101'] },
    })
    expect(valid.validRows[0].attendancePercentage).toBe(95.45)
    expect(valid.summary.warningCount).toBe(1)
    expect(valid.issues[0].message).toContain('Calculated from Present Days')

    const inconsistent = validateMappedRows({
      category: 'attendance', headers: headersFor('attendance'), mapping: mappingFor('attendance'),
      rows: [row(2, ['EMP-101', '2025-01', 90, 0, 1, 30, 22, 21, 8, 1, 2, 0, 31])],
      context: { employeeIds: ['EMP-101'] },
    })
    expect(inconsistent.summary.rejectedRows).toBe(1)
    expect(inconsistent.issues.some((item) => item.field === 'Attendance Percentage' && item.severity === 'error')).toBe(true)
    expect(inconsistent.issues.some((item) => item.field === 'Calendar Days' && item.severity === 'error')).toBe(true)
    expect(inconsistent.issues.some((item) => item.field === 'Payable Days' && item.severity === 'error')).toBe(true)

    const unclassified = validateMappedRows({
      category: 'attendance', headers: headersFor('attendance'), mapping: mappingFor('attendance'),
      rows: [row(2, ['EMP-101', '2025-01', 95.45, 0, 1, 31, 22, 21, 7, 1, 1, 0, 30])],
      context: { employeeIds: ['EMP-101'] },
    })
    expect(unclassified.summary.rejectedRows).toBe(1)
    expect(unclassified.issues.some((item) => item.field === 'Calendar Days' && item.message.includes('do not reconcile'))).toBe(true)
  })

  it('requires either an attendance percentage or a present-to-working-day ratio', () => {
    const result = validateMappedRows({
      category: 'attendance', headers: headersFor('attendance'), mapping: mappingFor('attendance'),
      rows: [row(2, ['EMP-101', '2025-01', '', 0, 1])], context: { employeeIds: ['EMP-101'] },
    })
    expect(result.summary.rejectedRows).toBe(1)
    expect(result.issues.some((item) => item.field === 'Attendance Percentage' && item.message.includes('both Present Days and Working Days'))).toBe(true)
  })

  it('provides a valid synthetic attendance template row with reconciled day totals', () => {
    const result = validateMappedRows({
      category: 'attendance', headers: headersFor('attendance'), mapping: mappingFor('attendance'),
      rows: [row(2, IMPORT_SCHEMAS.attendance.map(({ key }) => SAMPLE_ROWS.attendance[0][key] ?? ''))],
      context: { employeeIds: ['SYN-TPL-001'] },
    })
    expect(result.summary).toEqual({ totalRows: 1, validRows: 1, rejectedRows: 0, warningCount: 0 })
  })

  it('rejects missing required mappings and invalid uploaded file type or size', async () => {
    const missingMapping = validateMappedRows({ category: 'payroll', headers: [], mapping: {}, rows: [row(2, [])] })
    expect(missingMapping.summary.rejectedRows).toBe(1)
    await expect(parseImportFile({ name: 'data.xls', size: 10 })).rejects.toThrow(/unsupported file type/i)
    await expect(parseImportFile({ name: 'empty.csv', size: 0 })).rejects.toThrow(/empty/i)
    await expect(parseImportFile({ name: 'large.xlsx', size: MAX_IMPORT_BYTES + 1 })).rejects.toThrow(/10 MB/i)
  })

  it('preserves spreadsheet column positions when the header has blank cells', async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Synthetic payroll')
    worksheet.getCell('B1').value = 'Employee ID'
    worksheet.getCell('D1').value = 'Gross Pay'
    worksheet.getCell('E1').value = 'Month'
    worksheet.getCell('B2').value = 'SYN-101'
    worksheet.getCell('D2').value = 50000
    worksheet.getCell('E2').value = '2025-04'
    const file = new File([await workbook.xlsx.writeBuffer()], 'synthetic.xlsx')

    const { sheets: [sheet] } = await parseImportFile(file)
    expect(sheet.headers).toEqual([
      { index: 0, label: 'Column 1' },
      { index: 1, label: 'Employee ID' },
      { index: 2, label: 'Column 3' },
      { index: 3, label: 'Gross Pay' },
      { index: 4, label: 'Month' },
    ])
    const mapping = autoMapColumns('payroll', sheet.headers)
    expect(mapping).toMatchObject({ employeeId: 1, monthlyGrossSalary: 3, reportingMonth: 4 })
    expect(validateMappedRows({ category: 'payroll', ...sheet, mapping }).validRows[0])
      .toMatchObject({ employeeId: 'SYN-101', monthlyGrossSalary: 50000, reportingMonth: '2025-04' })
  })

  it('rejects a malformed file with an XLSX extension', async () => {
    const file = new File(['Synthetic text, not an Excel workbook'], 'broken.xlsx')
    await expect(parseImportFile(file)).rejects.toThrow(/valid Excel workbook/i)
  })

  it('validates recruitment counts, offer reconciliation, status, and duplicate requisition-month keys', () => {
    const result = validateMappedRows({
      category: 'recruitment', headers: headersFor('recruitment'), mapping: mappingFor('recruitment'),
      rows: [
        row(2, ['SYN-REQ-01', '2025-04', 'Engineering', 'Sample Analyst', 'Synthetic', '2025-04-02', 2, 1, 'open', 2, 1, '2025-04-03', '2025-04-04', '2025-05-15', 'Sample Recruiter']),
        row(3, ['SYN-REQ-02', '2025-04', 'Engineering', 'Sample Analyst', 'Synthetic', '2025-04-02', 1, 2, 'Unknown', 1, 2, '', '', '2025-04-01', 'Sample Recruiter']),
      ],
    })
    expect(result.validRows).toHaveLength(1)
    expect(result.summary.rejectedRows).toBe(1)
    expect(result.validRows[0].status).toBe('Open')
    expect(result.issues.some((entry) => entry.message.includes('exceed approved positions'))).toBe(true)
    expect(result.issues.some((entry) => entry.message.includes('Accepted offers cannot exceed'))).toBe(true)
    expect(result.issues.some((entry) => entry.message.includes('Choose one of'))).toBe(true)
    expect(result.issues.some((entry) => entry.message.includes('earlier than requisition'))).toBe(true)
    const duplicate = validateMappedRows({
      category: 'recruitment', headers: headersFor('recruitment'), mapping: mappingFor('recruitment'),
      rows: [
        row(2, ['SYN-REQ-03', '2025-04', 'Engineering', 'Sample Analyst', '', '2025-04-02', 1, 0, 'Open', '', '', '', '', '', '', '']),
        row(3, ['SYN-REQ-03', '2025-04', 'Engineering', 'Sample Analyst', '', '2025-04-02', 1, 0, 'Open', '', '', '', '', '', '', '']),
      ],
    })
    expect(duplicate.summary.rejectedRows).toBe(2)
    expect(duplicate.issues.some((entry) => entry.message.includes('Duplicate record'))).toBe(true)
  })

  it('validates recruitment dates in requisition, offer, acceptance, and joining order', () => {
    const result = validateMappedRows({
      category: 'recruitment', headers: headersFor('recruitment'), mapping: mappingFor('recruitment'),
      rows: [row(2, ['SYN-REQ-04', '2025-04', 'Engineering', 'Analyst', '', '2025-04-10', 1, 1, 'Closed', 1, 1, '2025-04-09', '2025-04-08', '2025-04-07', 'Sample Recruiter', 'Northstar Labs'])],
    })
    expect(result.summary.rejectedRows).toBe(1)
    expect(result.issues.map((entry) => entry.field)).toEqual(expect.arrayContaining(['Offer Date', 'Offer Accepted Date', 'Joining Date']))
  })

  it('validates contract date ranges and HR budget amounts and monthly uniqueness', () => {
    const contracts = validateMappedRows({
      category: 'contractManpower', headers: headersFor('contractManpower'), mapping: mappingFor('contractManpower'),
      rows: [row(2, ['SYN-C-01', '2025-04', 'Sample Vendor', 'Operations', 'Pune', '2025-06-01', '2025-05-31', 50000, 5000, 900, 'Active'])],
    })
    expect(contracts.summary.rejectedRows).toBe(1)
    expect(contracts.issues.some((entry) => entry.message.includes('earlier than contract start'))).toBe(true)

    const budgets = validateMappedRows({
      category: 'hrBudget', headers: headersFor('hrBudget'), mapping: mappingFor('hrBudget'),
      rows: [
        row(2, ['2025-04', 'Engineering', 'Payroll', 1000000, 'Sample Owner']),
        row(3, ['2025-04', 'Engineering', 'Payroll', -1, 'Sample Owner']),
      ],
    })
    expect(budgets.summary.rejectedRows).toBe(2)
    expect(budgets.issues.some((entry) => entry.message.includes('Duplicate record'))).toBe(true)
    expect(budgets.issues.some((entry) => entry.message.includes('Negative values'))).toBe(true)

    const companyBudgets = validateMappedRows({
      category: 'hrBudget', headers: headersFor('hrBudget'), mapping: mappingFor('hrBudget'),
      rows: [
        row(2, ['2025-04', 'Engineering', 'Payroll', 1000000, 'Sample Owner', 'Northstar Labs']),
        row(3, ['2025-04', 'Engineering', 'Payroll', 900000, 'Sample Owner', 'Northstar Services']),
      ],
    })
    expect(companyBudgets.summary.validRows).toBe(2)
    expect(companyBudgets.issues.some((entry) => entry.message.includes('Duplicate record'))).toBe(false)
  })

  it('validates leave, increment, exit, department, and location imports with synthetic references', () => {
    const leave = validateMappedRows({
      category: 'leave', headers: headersFor('leave'), mapping: mappingFor('leave'), context: { employeeIds: ['SYN-100'] },
      rows: [
        row(2, ['SYN-100', '2025-04', 'Annual', 10, 2, 1.5, 9.5]),
        row(3, ['SYN-100', '2025-04', 'Annual', 10, 3, 1.5, 8.5]),
        row(4, ['SYN-404', '2025-04', 'Annual', 10, 1, 0, 9]),
        row(5, ['SYN-100', '2025-05', 'Annual', 10, 2, 1, 20]),
      ],
    })
    expect(leave.summary.rejectedRows).toBe(4)
    expect(leave.issues.some((entry) => entry.message.includes('Duplicate record'))).toBe(true)
    expect(leave.issues.some((entry) => entry.message.includes('not present in the staged Employee Master'))).toBe(true)
    expect(leave.issues.some((entry) => entry.field === 'Closing Leave Balance' && entry.message.includes('Expected 9.00'))).toBe(true)

    const increments = validateMappedRows({
      category: 'increments', headers: headersFor('increments'), mapping: mappingFor('increments'), context: { employeeIds: ['SYN-100'] },
      rows: [
        row(2, ['SYN-100', '2025-04-01', 1000000, 1100000, 10, 'Approved']),
        row(3, ['SYN-100', '2025-04-01', 1000000, 900000, 10, 'Approved']),
        row(4, ['SYN-100', '2025-05-01', 1000000, 1100000, 5, 'Pending']),
      ],
    })
    expect(increments.summary.rejectedRows).toBe(2)
    expect(increments.summary.warningCount).toBe(1)
    expect(increments.issues.some((entry) => entry.message.includes('cannot be lower'))).toBe(true)
    expect(increments.issues.some((entry) => entry.message.includes('differs from the CTC change'))).toBe(true)

    const exits = validateMappedRows({
      category: 'exitRecords', headers: headersFor('exitRecords'), mapping: mappingFor('exitRecords'), context: { employeeIds: ['SYN-100'] },
      rows: [row(2, ['SYN-404', '2025-05-01', 'Voluntary', 'Synthetic'])],
    })
    expect(exits.summary.rejectedRows).toBe(1)

    const departments = validateMappedRows({
      category: 'departmentMaster', headers: headersFor('departmentMaster'), mapping: mappingFor('departmentMaster'),
      rows: [row(2, ['SYN-DEPT', 'Engineering']), row(3, ['SYN-DEPT', 'Engineering'])],
    })
    expect(departments.summary.rejectedRows).toBe(2)
    const locations = validateMappedRows({
      category: 'locationMaster', headers: headersFor('locationMaster'), mapping: mappingFor('locationMaster'),
      rows: [row(2, ['SYN-LOC', 'Bengaluru'])],
    })
    expect(locations.summary.validRows).toBe(1)
  })

  it('checks staged department and location masters when names are supplied', () => {
    const result = validateMappedRows({
      category: 'employeeMaster', headers: headersFor('employeeMaster'), mapping: mappingFor('employeeMaster'),
      context: { departmentNames: ['Engineering'], locationNames: ['Bengaluru'] },
      rows: [row(2, ['SYN-100', 'Sample Employee', 'Unknown', 'Bengaluru', 'Permanent', '', '2025-01-01', ''])],
    })
    expect(result.summary.rejectedRows).toBe(1)
    expect(result.issues.some((entry) => entry.field === 'Department' && entry.message.includes('Department Master'))).toBe(true)
  })

  it('reads Excel worksheets and preserves their names and source row numbers', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Employees').addRows([['Emp Code', 'Employee Name'], ['SYN-101', 'Sample A']])
    workbook.addWorksheet('Notes').addRows([['Not an import sheet']])
    const bytes = await workbook.xlsx.writeBuffer()
    const file = {
      name: 'sample.xlsx', size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }
    const parsed = await parseImportFile(file)
    expect(parsed.type).toBe('xlsx')
    expect(parsed.sheets.map((sheet) => sheet.name)).toEqual(['Employees', 'Notes'])
    expect(parsed.sheets[0].headers.map((header) => header.label)).toEqual(['Emp Code', 'Employee Name'])
    expect(parsed.sheets[0].rows[0]).toEqual({ rowNumber: 2, values: ['SYN-101', 'Sample A'] })
  })
})
