import { describe, expect, it } from 'vitest'
import { demoEmployees, getFilteredEmployees, getMonthMetrics, getTrendData } from './demoData'

describe('synthetic dashboard filters', () => {
  it('applies department, location, and employment type consistently to tables, KPIs, and trends', () => {
    const filters = { department: 'Engineering', location: 'Mumbai', employmentType: 'Permanent' }
    const employees = getFilteredEmployees({ monthValue: '2025-12', dateValue: '2025-12-31', ...filters })
    const metrics = getMonthMetrics('2025-12', filters, '2025-12-31')
    const trend = getTrendData(filters).at(-1)
    expect(employees.every((employee) => employee.department === filters.department && employee.location === filters.location && employee.employmentType === filters.employmentType)).toBe(true)
    expect(metrics.headcount).toBe(employees.length)
    expect(trend.headcount).toBe(metrics.headcount)
    expect(trend.payroll).toBe(Math.round(metrics.payroll))
  })

  it('calculates monthly attrition using opening and closing headcount', () => {
    const filters = { department: 'All departments', location: 'All locations', employmentType: 'All employment types' }
    const trend = getTrendData(filters).find((item) => item.month === 'Dec')
    const previous = getMonthMetrics('2025-11', filters).headcount
    const current = getMonthMetrics('2025-12', filters)
    const expected = Math.round(current.exits.length / ((previous + current.headcount) / 2) * 1000) / 10
    expect(trend.attrition).toBe(expected)
  })

  it('applies the company filter to workforce snapshots, KPIs, and monthly trends', () => {
    const filters = { company: 'Northstar Services', department: 'All departments', location: 'All locations', employmentType: 'All employment types' }
    const employees = getFilteredEmployees({ monthValue: '2025-12', dateValue: '2025-12-31', ...filters })
    const metrics = getMonthMetrics('2025-12', filters, '2025-12-31')
    const trend = getTrendData(filters).at(-1)
    expect(employees.length).toBeGreaterThan(0)
    expect(employees.every((employee) => employee.company === filters.company)).toBe(true)
    expect(metrics.headcount).toBe(employees.length)
    expect(trend.headcount).toBe(metrics.headcount)
    expect(trend.payroll).toBe(Math.round(metrics.payroll))
  })

  it('calculates synthetic leave utilisation from the April financial-year start', () => {
    const filters = { department: 'All departments', location: 'All locations', employmentType: 'All employment types', company: 'All companies' }
    const march = getFilteredEmployees({ monthValue: '2025-03', dateValue: '2025-03-31', ...filters })
    const april = getFilteredEmployees({ monthValue: '2025-04', dateValue: '2025-04-30', ...filters })
    const sourceEmployee = demoEmployees.find((employee) => employee.id === march[0].id)
    expect(march[0].leaveTakenYtd).toBe(sourceEmployee.monthlySignals.slice(0, 3).reduce((total, month) => total + month.leaveTaken, 0))
    expect(april.find((employee) => employee.id === march[0].id).leaveTakenYtd).toBe(sourceEmployee.monthlySignals[3].leaveTaken)
  })

  it('uses a selected alternate reporting-year start in synthetic employee snapshots', () => {
    const filters = { department: 'All departments', location: 'All locations', employmentType: 'All employment types', company: 'All companies' }
    const employees = getFilteredEmployees({ monthValue: '2025-12', dateValue: '2025-12-31', financialYearStartMonth: 7, ...filters })
    const sourceEmployee = demoEmployees.find((employee) => employee.id === employees[0].id)
    expect(employees[0].leaveTakenYtd).toBe(sourceEmployee.monthlySignals.slice(6, 12).reduce((total, month) => total + month.leaveTaken, 0))
  })
})
