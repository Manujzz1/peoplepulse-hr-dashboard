import { normalizeFinancialYearStartMonth } from './reportingCalendar.js'

const departments = ['Engineering', 'Product', 'People', 'Finance', 'Sales', 'Operations']
const companies = ['Northstar Labs', 'Northstar Services']
const locations = ['Bengaluru', 'Mumbai', 'Pune', 'Hyderabad', 'Delhi']
const projects = ['Atlas Platform', 'Northstar', 'Customer 360', 'PeopleOS', 'Nimbus Cloud', 'Core Operations']
const employmentTypes = ['Permanent', 'Permanent', 'Permanent', 'Contract']
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const DEMO_ANNUAL_LEAVE_ENTITLEMENT_DAYS = 24

const hash = (value) => {
  const result = Math.sin(value * 127.1 + 311.7) * 43758.5453
  return result - Math.floor(result)
}

const monthDate = (year, month, day = 1) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

export const demoEmployees = Array.from({ length: 120 }, (_, index) => {
  const department = departments[Math.floor(hash(index + 1) * departments.length)]
  const hireYear = index < 96 ? 2018 + Math.floor(hash(index + 12) * 7) : 2025
  const hireMonth = index < 96 ? Math.floor(hash(index + 29) * 12) : Math.floor((index - 96) / 2)
  const hireDate = monthDate(hireYear, hireMonth, 1 + Math.floor(hash(index + 48) * 25))
  const hasExited = index < 96 && index % 19 === 0
  const exitDate = hasExited ? monthDate(2025, (index * 3) % 12, 12 + (index % 12)) : null
  const incrementPercent = Math.round((2 + hash(index + 70) * 11) * 10) / 10
  const monthlyBase = Math.round((department === 'Engineering' ? 100000 : department === 'Product' ? 108000 : 78000) * (0.72 + hash(index + 91) * 0.78) / 1000) * 1000
  const projectIndex = Math.floor(hash(index + 140) * projects.length)
  const hasProjectTransfer = hash(index + 252) > 0.78
  const transferMonth = Math.floor(hash(index + 250) * 12)
  const transferDate = monthDate(2025, transferMonth, 5 + Math.floor(hash(index + 251) * 23))
  const projectHistory = hasProjectTransfer && new Date(`${hireDate}T00:00:00`) < new Date(`${transferDate}T00:00:00`) && (!hasExited || new Date(`${exitDate}T00:00:00`) > new Date(`${transferDate}T00:00:00`))
    ? [{ date: transferDate, project: projects[(projectIndex + 1 + Math.floor(hash(index + 253) * (projects.length - 1))) % projects.length] }]
    : []
  const monthlySignals = monthNames.map((_, month) => ({
    attendance: Math.round((91 + hash((index + 1) * 1009 + month * 31 + 120) * 8) * 10) / 10,
    lopDays: Math.floor(hash((index + 1) * 1013 + month * 37 + 220) * 5),
    leaveTaken: Math.floor(hash((index + 1) * 1019 + month * 41 + 235) * 3),
  }))

  return {
    id: `SYN-${String(index + 1).padStart(3, '0')}`,
    name: `Sample Employee ${String(index + 1).padStart(3, '0')}`,
    company: companies[index % companies.length],
    department,
    location: locations[Math.floor(hash(index + 155) * locations.length)],
    employmentType: employmentTypes[Math.floor(hash(index + 170) * employmentTypes.length)],
    gender: ['Female', 'Male', 'Non-binary'][Math.floor(hash(index + 180) * 3)],
    project: projects[projectIndex],
    projectHistory,
    allocation: [100, 100, 80, 60, 50][Math.floor(hash(index + 190) * 5)],
    hireDate,
    exitDate,
    monthlyBase,
    incrementPercent,
    performanceScore: Math.round((2.2 + hash(index + 205) * 2.8) * 10) / 10,
    monthlySignals,
  }
})

export const months = monthNames.map((label, index) => ({
  label: `${label} 2025`,
  value: `2025-${String(index + 1).padStart(2, '0')}`,
  month: index,
}))

export const getMonthEnd = (monthValue) => {
  const [year, month] = monthValue.split('-').map(Number)
  return new Date(year, month, 0, 23, 59, 59)
}

export const getAsOfDate = (dateValue, monthValue) =>
  dateValue ? new Date(`${dateValue}T23:59:59`) : getMonthEnd(monthValue)

export const isActiveAt = (employee, date) =>
  new Date(`${employee.hireDate}T00:00:00`) <= date &&
  (!employee.exitDate || new Date(`${employee.exitDate}T23:59:59`) > date)

export const salaryAt = (employee, date) => {
  const incrementDate = new Date('2025-04-01T00:00:00')
  return employee.monthlyBase * (date >= incrementDate ? 1 + employee.incrementPercent / 100 : 1)
}

export const getEmployeeSnapshot = (employee, monthValue, dateValue, financialYearStartMonth = 4) => {
  const date = getAsOfDate(dateValue, monthValue)
  const monthIndex = Number(monthValue.split('-')[1]) - 1
  const signals = employee.monthlySignals[monthIndex]
  const hireDate = new Date(`${employee.hireDate}T00:00:00`)
  const firstTrackedMonth = hireDate.getFullYear() === 2025 ? hireDate.getMonth() : 0
  // The synthetic series starts in January 2025; when a selected year began
  // before January, only the available in-year synthetic months can be used.
  const configuredStartIndex = normalizeFinancialYearStartMonth(financialYearStartMonth) - 1
  const financialYearStartIndex = monthIndex >= configuredStartIndex ? configuredStartIndex : 0
  const leaveTakenYtd = employee.monthlySignals.slice(Math.max(firstTrackedMonth, financialYearStartIndex), monthIndex + 1).reduce((sum, month) => sum + month.leaveTaken, 0)
  const projectTransfer = [...employee.projectHistory].reverse().find((transfer) => new Date(`${transfer.date}T00:00:00`) <= date)
  return {
    ...employee,
    ...signals,
    leaveTakenYtd,
    project: projectTransfer?.project || employee.project,
    monthlySalary: salaryAt(employee, date),
    annualCtc: salaryAt(employee, date) * 12 * 1.15,
    tenureYears: Math.max(0, (date - hireDate) / 31557600000),
  }
}

export const getFilteredEmployees = ({ monthValue, department, location, dateValue, employmentType, company, financialYearStartMonth = 4 }) => {
  const date = getAsOfDate(dateValue, monthValue)
  return demoEmployees
    .filter((employee) => isActiveAt(employee, date))
    .filter((employee) => department === 'All departments' || employee.department === department)
    .filter((employee) => location === 'All locations' || employee.location === location)
    .filter((employee) => !employmentType || employmentType === 'All employment types' || employee.employmentType === employmentType)
    .filter((employee) => !company || company === 'All companies' || employee.company === company)
    .map((employee) => getEmployeeSnapshot(employee, monthValue, dateValue, financialYearStartMonth))
}

export const getMonthMetrics = (monthValue, filters = {}, dateValue, options = {}) => {
  const date = getAsOfDate(dateValue, monthValue)
  const [year, month] = monthValue.split('-').map(Number)
  const monthIndex = month - 1
  const monthStart = new Date(year, monthIndex, 1)
  const matchesFilters = (employee) =>
    (filters.department === 'All departments' || !filters.department || employee.department === filters.department) &&
    (filters.location === 'All locations' || !filters.location || employee.location === filters.location) &&
    (filters.company === 'All companies' || !filters.company || employee.company === filters.company) &&
    (filters.employmentType === 'All employment types' || !filters.employmentType || employee.employmentType === filters.employmentType)
  const active = demoEmployees.filter((employee) => isActiveAt(employee, date) && matchesFilters(employee))
    .map((employee) => getEmployeeSnapshot(employee, monthValue, dateValue, options.financialYearStartMonth ?? 4))
  const joiners = demoEmployees.filter((employee) => {
    const hired = new Date(`${employee.hireDate}T00:00:00`)
    return hired >= monthStart && hired <= date && matchesFilters(employee)
  })
  const exits = demoEmployees.filter((employee) => {
    if (!employee.exitDate) return false
    const exited = new Date(`${employee.exitDate}T00:00:00`)
    return exited >= monthStart && exited <= date && matchesFilters(employee)
  })
  const payroll = active.reduce((sum, employee) => sum + employee.monthlySalary, 0)
  const projectTransfers = demoEmployees.flatMap((employee) => employee.projectHistory.filter((transfer) => {
    const transferred = new Date(`${transfer.date}T00:00:00`)
    return transferred >= monthStart && transferred <= date && matchesFilters(employee)
  }))

  return { active, joiners, exits, projectTransfers, payroll, headcount: active.length }
}

export const getTrendData = (filters = {}) =>
  months.map(({ label, value }) => {
    const { active, joiners, exits, projectTransfers, payroll, headcount } = getMonthMetrics(value, filters)
    const previousHeadcount = getMonthMetrics(getPreviousMonthValue(value), filters).headcount
    const averageHeadcount = (previousHeadcount + headcount) / 2
    const attendance = active.length
      ? active.reduce((sum, employee) => sum + employee.attendance, 0) / active.length
      : 0
    return {
      month: label.split(' ')[0],
      reportingMonth: value,
      headcount,
      payroll: Math.round(payroll),
      joiners: joiners.length,
      exits: exits.length,
      projectTransfers: projectTransfers.length,
      attendance: Math.round(attendance * 10) / 10,
      attrition: averageHeadcount ? Math.round(exits.length / averageHeadcount * 1000) / 10 : null,
    }
  })

export const getDepartmentData = (employees, metric = 'headcount') => {
  const grouped = departments.map((department) => {
    const members = employees.filter((employee) => employee.department === department)
    return {
      department,
      headcount: members.length,
      payroll: Math.round(members.reduce((sum, employee) => sum + employee.monthlySalary, 0)),
      incrementCost: Math.round(members.reduce((sum, employee) => sum + employee.monthlySalary - employee.monthlyBase, 0)),
      increment: members.length
        ? Math.round((members.reduce((sum, employee) => sum + employee.incrementPercent, 0) / members.length) * 10) / 10
        : 0,
      attendance: members.length
        ? Math.round((members.reduce((sum, employee) => sum + employee.attendance, 0) / members.length) * 10) / 10
        : 0,
    }
  })
  return metric === 'headcount' ? grouped.filter((item) => item.headcount > 0) : grouped
}

export const getGroupData = (employees, key, label = key) => {
  const groups = new Map()
  employees.forEach((employee) => {
    const name = employee[key]
    const group = groups.get(name) || { [label]: name, headcount: 0, payroll: 0, allocation: 0 }
    group.headcount += 1
    group.payroll += employee.monthlySalary
    group.allocation += employee.allocation
    groups.set(name, group)
  })
  return [...groups.values()].map((group) => ({
    ...group,
    payroll: Math.round(group.payroll),
    allocation: Math.round(group.allocation / Math.max(group.headcount, 1)),
  }))
}

export const getPreviousMonthValue = (monthValue) => {
  const [year, month] = monthValue.split('-').map(Number)
  const previous = new Date(year, month - 2, 1)
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
}

export const getPreviousDateValue = (dateValue) => {
  const [year, month, day] = dateValue.split('-').map(Number)
  const previousMonthEnd = new Date(year, month - 1, 0).getDate()
  const previous = new Date(year, month - 2, Math.min(day, previousMonthEnd))
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}-${String(previous.getDate()).padStart(2, '0')}`
}

export const departmentsList = departments
export const companiesList = companies
export const locationsList = locations
export const employmentTypesList = [...new Set(employmentTypes)]
export const projectsList = projects
export const formatINR = (value, compact = false) => {
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    notation: compact ? 'compact' : 'standard',
  })
  return formatter.format(value || 0)
}

export const DEMO_DATA_LOADED_AT = new Date().toISOString()
export const DEMO_DATA_LOADED_AT_LABEL = new Date(DEMO_DATA_LOADED_AT).toLocaleString()
