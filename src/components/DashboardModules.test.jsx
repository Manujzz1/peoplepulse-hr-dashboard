/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import DashboardModules from './DashboardModules'

vi.mock('recharts', async (importOriginal) => {
  const recharts = await importOriginal()
  return { ...recharts, ResponsiveContainer: ({ children }) => children }
})

afterEach(cleanup)

describe('Imported workforce exit analytics', () => {
  it('shows recorded exit types and average tenure at exit from filtered period metrics', () => {
    render(<DashboardModules
      page="workforce" isImported employees={[]} trends={[]} departments={[]}
      workforceHeadcount={{ exitTypeDistribution: [{ exitType: 'Voluntary', count: 2 }], averageTenureAtExitYears: 4.25 }}
      getPeriodMetrics={() => ({ headcount: 120 })}
    />)
    const panel = screen.getByRole('heading', { name: 'Exit profile' }).closest('section')
    expect(within(panel).getByText('Voluntary')).toBeTruthy()
    expect(within(panel).getByText('2')).toBeTruthy()
    expect(within(panel).getByText(/4.3 years/)).toBeTruthy()
  })
})

describe('Configurable reporting calendar', () => {
  it('labels leave metrics using the selected reporting-year start month', () => {
    render(<DashboardModules
      page="attendance" employees={[]} trends={[]} departments={[]}
      selectedMonth="2025-12" selectedDate="2025-12-31" financialYearStartMonth={1}
      filters={{ department: 'All departments', location: 'All locations', employmentType: 'All employment types' }}
      getPeriodMetrics={() => ({ leaveAccess: true, leaveMissingBalanceCount: 0, leaveBalanceMismatchCount: 0, leaveMissingEmployeeCount: 0, leaveAvailableDays: 0 })}
    />)
    expect(screen.getAllByText(/January–December FYTD/).length).toBeGreaterThan(0)
  })
})

describe('Project allocation salary permissions', () => {
  it('keeps allocation visible but hides salary and project cost from a project-only user', () => {
    const employee = {
      id: 'SYN-TEST-01',
      name: 'Synthetic Test User',
      department: 'Engineering',
      location: 'Bengaluru',
      employmentType: 'Permanent',
      project: 'Synthetic Project',
      allocation: 75,
      monthlySalary: 98765,
    }

    render(<DashboardModules
      page="projects"
      employees={[employee]}
      projectAssignments={[employee]}
      trends={[]}
      departments={[]}
      selectedMonth="2025-12"
      selectedDate="2025-12-31"
      filters={{ department: 'All departments', location: 'All locations', employmentType: 'All employment types' }}
      canReadPayroll={false}
    />)

    expect(screen.getByText('Restricted')).toBeTruthy()
    expect(screen.getByText('Requires payroll.read permission')).toBeTruthy()

    const allocationDirectory = screen.getByRole('heading', { name: 'Project allocation directory' }).closest('section')
    expect(within(allocationDirectory).getByRole('columnheader', { name: 'Allocation' })).toBeTruthy()
    expect(within(allocationDirectory).getByText('Synthetic Project')).toBeTruthy()
    expect(within(allocationDirectory).queryByRole('columnheader', { name: 'Monthly gross' })).toBeNull()
    expect(document.body.textContent).not.toContain('98,765')
  })

  it('changes imported project costs and employee gross basis from the selected cost source', () => {
    const employee = { id: 'SYN-TEST-04', employeeId: 'SYN-TEST-04', name: 'Synthetic Cost User', department: 'Engineering', project: 'Synthetic Project', allocation: 50 }
    const getPeriodMetrics = (_month, _filters, _date, options) => {
      const allocationBasis = options?.projectCostBasis === 'allocation'
      return {
        projectAllocationData: [{ project: 'Synthetic Project', headcount: 1, allocated: 50, available: 50, cost: allocationBasis ? 1000 : 625 }],
        projectAllocationRows: [{ ...employee, monthlySalary: allocationBasis ? 2000 : 1250, allocationWeightedCost: allocationBasis ? 1000 : 625 }],
        projectAllocationCostAvailable: true,
        projectAllocationCostBasisLabel: allocationBasis ? 'Allocation row monthly gross' : 'Payroll monthly gross',
      }
    }

    function Harness() {
      const [projectCostBasis, setProjectCostBasis] = useState('hybrid')
      return <DashboardModules
        page="projects" employees={[employee]} projectAssignments={[employee]} trends={[]} departments={[]}
        selectedMonth="2025-12" selectedDate="2025-12-31"
        filters={{ department: 'All departments', location: 'All locations', employmentType: 'All employment types' }}
        getPeriodMetrics={getPeriodMetrics} isImported canReadPayroll projectCostBasis={projectCostBasis} onProjectCostBasisChange={setProjectCostBasis}
      />
    }
    render(<Harness />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Project cost basis' }), { target: { value: 'allocation' } })
    expect(screen.getAllByText('Allocation row monthly gross')).toHaveLength(2)
    const allocationDirectory = screen.getByRole('heading', { name: 'Project allocation directory' }).closest('section')
    expect(within(allocationDirectory).getByText('₹2,000')).toBeTruthy()
    expect(within(allocationDirectory).getByText('₹1,000')).toBeTruthy()
  })
})

describe('Attendance and leave permissions', () => {
  it('shows attendance but withholds leave KPIs, charts, and employee columns without leave access', () => {
    const employee = {
      id: 'SYN-TEST-02',
      name: 'Synthetic Attendance User',
      department: 'Engineering',
      attendance: 92,
      lopDays: 1,
      leaveTakenYtd: 19,
    }
    const getPeriodMetrics = () => ({
      attendanceAveragePercentage: 92,
      attendanceLopDays: 1,
      attendanceDepartmentData: [{ department: 'Engineering', attendance: 92 }],
      leaveAccess: false,
      leaveUtilisationPercentage: 76,
      leaveDepartmentData: [{ department: 'Engineering', utilisation: 76 }],
    })

    render(<DashboardModules
      page="attendance"
      employees={[employee]}
      trends={[]}
      departments={[]}
      selectedMonth="2025-12"
      selectedDate="2025-12-31"
      filters={{ department: 'All departments', location: 'All locations', employmentType: 'All employment types' }}
      getPeriodMetrics={getPeriodMetrics}
      isImported
      canReadLeave={false}
    />)

    expect(screen.getByText('92.0%')).toBeTruthy()
    expect(screen.getByText('Restricted')).toBeTruthy()
    expect(screen.getAllByText('Leave analytics require leave.read permission.')).toHaveLength(2)
    expect(document.body.textContent).not.toContain('76')
    expect(document.body.textContent).not.toContain('19')

    const attendanceDirectory = screen.getByRole('heading', { name: 'Attendance overview' }).closest('section')
    expect(within(attendanceDirectory).getByRole('columnheader', { name: 'LOP days' })).toBeTruthy()
    expect(within(attendanceDirectory).queryByRole('columnheader', { name: 'FYTD leave taken' })).toBeNull()
  })
})

describe('Payroll table fields', () => {
  it('does not include PMS increment fields in the compensation directory', () => {
    const employee = {
      id: 'SYN-TEST-03',
      name: 'Synthetic Payroll User',
      department: 'Engineering',
      monthlySalary: 90000,
      annualCtc: 1242000,
      incrementPercent: 12,
    }

    render(<DashboardModules
      page="payroll"
      employees={[employee]}
      trends={[]}
      departments={[]}
      selectedMonth="2025-12"
      selectedDate="2025-12-31"
      filters={{ department: 'All departments', location: 'All locations', employmentType: 'All employment types' }}
      getPeriodMetrics={() => ({ payroll: 90000, payrollAnnualCtc: 1242000, incrementAccess: false })}
      isImported
    />)

    const compensationDirectory = screen.getByRole('heading', { name: 'Compensation directory' }).closest('section')
    expect(within(compensationDirectory).getByRole('columnheader', { name: 'Monthly gross' })).toBeTruthy()
    expect(within(compensationDirectory).queryByRole('columnheader', { name: 'PMS reported increment' })).toBeNull()
    expect(within(compensationDirectory).queryByRole('columnheader', { name: 'Increment' })).toBeNull()
  })

  it('shows complete reported component totals separately from gross pay and labels source columns', () => {
    const employee = { id: 'SYN-TEST-05', name: 'Synthetic Component User', department: 'Engineering', monthlySalary: 50000, annualCtc: 690000, monthlyBasic: 30000, monthlyHra: 12000 }
    const getPeriodMetrics = () => ({
      payroll: 50000,
      payrollAnnualCtc: 690000,
      missingAnnualCtcCount: 0,
      payrollDepartmentData: [{ department: 'Engineering', payroll: 50000 }],
      payrollComponentFields: ['monthlyBasic', 'monthlyHra'],
      payrollComponentTotals: [
        { component: 'Basic', amount: 30000, complete: true },
        { component: 'HRA', amount: 12000, complete: true },
      ],
      incrementAccess: true,
      incrementMonthlyCostImpact: 0,
      incrementAveragePercent: null,
      incrementApprovedCount: 0,
      incrementComplete: true,
      incrementDepartmentData: [],
    })
    render(<DashboardModules
      page="payroll" employees={[employee]} trends={[]} departments={[]}
      selectedMonth="2025-12" selectedDate="2025-12-31"
      filters={{ department: 'All departments', location: 'All locations', employmentType: 'All employment types' }}
      getPeriodMetrics={getPeriodMetrics} isImported
    />)

    const componentPanel = screen.getByRole('heading', { name: 'Reported payroll components' }).closest('section')
    expect(within(componentPanel).getByText('Basic')).toBeTruthy()
    expect(within(componentPanel).getByText('HRA')).toBeTruthy()
    const compensationDirectory = screen.getByRole('heading', { name: 'Compensation directory' }).closest('section')
    expect(within(compensationDirectory).getByRole('columnheader', { name: 'Basic (reported)' })).toBeTruthy()
    expect(within(compensationDirectory).getByRole('columnheader', { name: 'HRA (reported)' })).toBeTruthy()
  })
})

describe('configurable increment bands', () => {
  const employees = [
    { id: 'SYN-INC-01', name: 'Sample Increment One', department: 'Engineering', incrementPercent: 4, monthlySalary: 52000, monthlyBase: 50000 },
    { id: 'SYN-INC-02', name: 'Sample Increment Two', department: 'Engineering', incrementPercent: 8, monthlySalary: 54000, monthlyBase: 50000 },
  ]

  function Harness() {
    const [incrementBandLimits, setIncrementBandLimits] = useState([3, 6, 9])
    return <DashboardModules
      page="performance" employees={employees} trends={[]} departments={[{ department: 'Engineering' }]}
      selectedMonth="2025-12" selectedDate="2025-12-31"
      filters={{ department: 'All departments', location: 'All locations', employmentType: 'All employment types' }}
      getPeriodMetrics={() => ({ incrementDepartmentData: [] })}
      incrementBandLimits={incrementBandLimits} onIncrementBandLimitsChange={setIncrementBandLimits}
    />
  }

  it('applies valid cutoffs and updates the visible distribution', () => {
    render(<Harness />)
    const distribution = screen.getByRole('heading', { name: 'Increment percentage distribution' }).closest('section')
    fireEvent.click(screen.getByText('Configure increment bands'))
    expect(within(distribution).getByText(/3.*<6%/)).toBeTruthy()
    expect(within(distribution).getByText(/6.*<9%/)).toBeTruthy()

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Increment band cutoff 1' }), { target: { value: '5' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Increment band cutoff 2' }), { target: { value: '10' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Increment band cutoff 3' }), { target: { value: '15' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Apply bands' }).closest('form'))

    expect(within(distribution).getByText(/0.*<5%/)).toBeTruthy()
    expect(within(distribution).getByText(/5.*<10%/)).toBeTruthy()
    expect(within(distribution).queryByText(/3.*<6%/)).toBeNull()
  })

  it('rejects non-increasing cutoffs and leaves the chart unchanged', () => {
    render(<Harness />)
    const distribution = screen.getByRole('heading', { name: 'Increment percentage distribution' }).closest('section')
    fireEvent.click(screen.getByText('Configure increment bands'))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Increment band cutoff 1' }), { target: { value: '9' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Increment band cutoff 2' }), { target: { value: '6' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Apply bands' }).closest('form'))

    expect(screen.getByRole('alert').textContent).toContain('three increasing cutoffs')
    expect(within(distribution).getByText(/3.*<6%/)).toBeTruthy()
  })
})

describe('executive recruitment summary', () => {
  it('shows imported vacancies as provisional until the reporting month is confirmed complete', () => {
    render(<DashboardModules
      page="executive" employees={[]} trends={[]} departments={[]}
      selectedMonth="2025-12" selectedDate="2025-12-31"
      filters={{ department: 'All departments', location: 'All locations', employmentType: 'All employment types' }}
      getPeriodMetrics={() => ({ headcount: 0, payroll: 0, active: [], joiners: [], exits: [], recruitmentAvailable: true, recruitmentComplete: false, recruitmentOpenPositions: 2 })}
    />)

    expect(screen.getAllByText('Open vacancies')[0]).toBeTruthy()
    expect(screen.getByText('Provisional')).toBeTruthy()
    expect(screen.getByText('2 reported · recruitment month is incomplete')).toBeTruthy()
  })

  it('shows the confirmed open position count when recruitment is complete', () => {
    render(<DashboardModules
      page="executive" employees={[]} trends={[]} departments={[]}
      selectedMonth="2025-12" selectedDate="2025-12-31"
      filters={{ department: 'All departments', location: 'All locations', employmentType: 'All employment types' }}
      getPeriodMetrics={() => ({ headcount: 0, payroll: 0, active: [], joiners: [], exits: [], recruitmentAvailable: true, recruitmentComplete: true, recruitmentOpenPositions: 4 })}
    />)

    const vacancyCard = screen.getAllByText('Open vacancies')[0].closest('article')
    expect(within(vacancyCard).getByText('4')).toBeTruthy()
    expect(within(vacancyCard).getByText('Approved positions not yet filled')).toBeTruthy()
  })
})
