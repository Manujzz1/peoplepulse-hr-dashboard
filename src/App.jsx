import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays, Check, ChevronDown, Database, LogOut, MapPin, Menu, Search,
} from 'lucide-react'

import Sidebar from './components/Sidebar'
import Login from './components/Login'
import HelpCenter from './components/HelpCenter'
import NotificationsCenter from './components/NotificationsCenter'
import { supabase, supabaseConfigured } from './auth/supabaseClient'
import { authStatusForEvent, authStatusForInitialSession } from './auth/sessionStatus'
import { canAccessPage, getAllowedReportKeys, getDepartmentScope, hasPermission, loadAccessProfile, PAGE_PERMISSIONS, REPORT_PERMISSIONS } from './auth/accessControl'
const DataImportCenter = lazy(() => import('./components/DataImportCenter'))
const DashboardModules = lazy(() => import('./components/DashboardModules'))
const ReportsCenter = lazy(() => import('./components/ReportsCenter'))
const PlanningModules = lazy(() => import('./components/PlanningModules'))
const EmployeeDirectory = lazy(() => import('./components/EmployeeDirectory'))
const DataQualityCenter = lazy(() => import('./components/DataQualityCenter'))
import { IMPORT_CATEGORIES } from './import/importSchemas'
import { getPlanningReport } from './data/planningModel'
import { DEFAULT_INCREMENT_BAND_LIMITS } from './data/incrementPolicy'
import { REPORTING_MONTHS } from './data/reportingCalendar'
import { rollbackImportStage } from './import/staging'
import { createHrModel, getImportedAvailableMonths, getImportedDashboardReadiness, getImportedEmployeeDirectory, getImportedMonthMetrics, getImportedTrendData } from './data/hrModel'
import {
  companiesList, DEMO_DATA_LOADED_AT, DEMO_DATA_LOADED_AT_LABEL, departmentsList, demoEmployees, employmentTypesList, getDepartmentData, getFilteredEmployees, getMonthMetrics,
  getTrendData, locationsList, months,
} from './data/demoData'
import './App.css'

const pageInfo = {
  executive: ['Executive dashboard', 'A clear view of your people, costs, and momentum.'],
  workforce: ['Workforce analytics', 'Understand how your workforce is changing across teams and locations.'],
  employeeMaster: ['Employee Master', 'Search employee records and review effective-dated workplace history.'],
  payroll: ['Payroll & CTC', 'Track workforce costs, compensation changes, and payroll movement.'],
  attendance: ['Attendance & leave', 'Monitor attendance patterns and leave utilisation across the organisation.'],
  performance: ['Performance & increments', 'Connect performance outcomes with compensation and investment.'],
  projects: ['Project allocation', 'See how people and payroll are distributed across active projects.'],
  dataImport: ['Data Import', 'Preview, map and validate files in an isolated in-memory staging area.'],
  dataQuality: ['Data Quality', 'Review import completeness, coverage gaps, and data reconciliation status.'],
  reports: ['Reports Centre', 'Preview and download management reports using the active dashboard filters.'],
  recruitment: ['Recruitment analytics', 'Review requisition status, hiring activity, and offer outcomes from imported data.'],
  contracts: ['Contract manpower', 'Review active contractor counts, contract dates, and reported vendor costs.'],
  budget: ['HR budget', 'Compare approved monthly budgets with available, complete actual sources.'],
}

const fixedDepartment = (value) => value === 'All departments' ? 'All departments' : value
const permissionsForPage = (page, allowedReportKeys) => page === 'reports'
  ? [...new Set(allowedReportKeys.flatMap((report) => REPORT_PERMISSIONS[report] || []))]
  : PAGE_PERMISSIONS[page]

function FilterSelect({ label, icon: Icon, value, options, onChange }) {
  return (
    <label className="filter-control">
      {Icon && <Icon size={15} />}
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {options.map((option) => <option key={option.value || option} value={option.value || option}>{option.label || option}</option>)}
      </select>
      <ChevronDown size={13} className="select-chevron" />
    </label>
  )
}

function DateFilter({ value, onChange, min = '2025-01-01', max = '2025-12-31' }) {
  return (
    <label className="filter-control date-filter">
      <CalendarDays size={15} />
      <span className="sr-only">As of date</span>
      <input type="date" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} aria-label="As of date" />
    </label>
  )
}

function App() {
  const [authStatus, setAuthStatus] = useState(supabaseConfigured ? 'loading' : sessionStorage.getItem('peoplepulse-demo-mode') === 'true' ? 'demo' : 'anonymous')
  const [authSession, setAuthSession] = useState(null)
  const [authActionError, setAuthActionError] = useState('')
  const [accessProfile, setAccessProfile] = useState(null)
  const [accessStatus, setAccessStatus] = useState('idle')
  const [accessIdentity, setAccessIdentity] = useState('')
  const accessIdentityRef = useRef('')
  const [activePage, setActivePage] = useState('executive')
  const [dataSource, setDataSource] = useState('demo')
  const [stagedImports, setStagedImports] = useState({})
  const [importHistory, setImportHistory] = useState([])
  const [importRollback, setImportRollback] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState('2025-12')
  const [selectedDate, setSelectedDate] = useState('2025-12-31')
  const [financialYearStartMonth, setFinancialYearStartMonth] = useState(4)
  const [department, setDepartment] = useState('All departments')
  const [location, setLocation] = useState('All locations')
  const [employmentType, setEmploymentType] = useState('All employment types')
  const [company, setCompany] = useState('All companies')
  const [projectCostBasis, setProjectCostBasis] = useState('hybrid')
  const [incrementBandLimits, setIncrementBandLimits] = useState(DEFAULT_INCREMENT_BAND_LIMITS)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const previousAuthStatus = useRef(authStatus)
  useEffect(() => {
    if (previousAuthStatus.current === 'authenticated' && authStatus !== 'authenticated') {
      setStagedImports({})
      setImportHistory([])
      setImportRollback(null)
      setDataSource('demo')
      setAccessProfile(null)
      setAccessIdentity('')
      setAccessStatus('idle')
      accessIdentityRef.current = ''
    }
    previousAuthStatus.current = authStatus
  }, [authStatus])
  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      setAuthSession(session)
      setAuthStatus((current) => authStatusForEvent(event, session, current))
    })
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setAuthStatus(authStatusForInitialSession(null, sessionStorage.getItem('peoplepulse-demo-mode') === 'true', 'loading'))
        return
      }
      setAuthSession(data.session)
      setAuthStatus((current) => authStatusForInitialSession(data.session, sessionStorage.getItem('peoplepulse-demo-mode') === 'true', current))
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])
  useEffect(() => {
    if (authStatus !== 'authenticated') {
      return undefined
    }
    const userId = authSession?.user?.id
    if (!supabase || !userId) return undefined
    let active = true
    loadAccessProfile(supabase, userId).then((profile) => {
      if (!active) return
      const nextIdentity = `${userId}:${authSession?.access_token || ''}`
      if (accessIdentityRef.current && accessIdentityRef.current !== nextIdentity) {
        setStagedImports({})
        setImportHistory([])
        setImportRollback(null)
        setDataSource('demo')
      }
      if (!hasPermission(profile, 'imports.write')) {
        setStagedImports({})
        setImportHistory([])
        setImportRollback(null)
        setDataSource('demo')
      }
      accessIdentityRef.current = nextIdentity
      setAccessProfile(profile)
      setAccessIdentity(nextIdentity)
      setAccessStatus('ready')
    }).catch(() => {
      if (!active) return
      setAccessProfile(null)
      setAccessIdentity(`${userId}:${authSession?.access_token || ''}`)
      setAccessStatus('error')
    })
    return () => { active = false }
  }, [authStatus, authSession?.user?.id, authSession?.access_token])
  const authenticated = authStatus === 'authenticated'
  const currentAccessIdentity = `${authSession?.user?.id || ''}:${authSession?.access_token || ''}`
  const authenticatedAccessReady = authenticated && accessStatus === 'ready' && accessIdentity === currentAccessIdentity
  const accessLoading = authenticated && !(accessStatus === 'error' && accessIdentity === currentAccessIdentity) && !authenticatedAccessReady
  const canImport = authStatus === 'demo' || (authenticatedAccessReady && hasPermission(accessProfile, 'imports.write'))
  const allowedReportKeys = useMemo(() => authStatus === 'demo'
    ? getAllowedReportKeys({ permissions: new Set(['*']) })
    : authenticatedAccessReady ? getAllowedReportKeys(accessProfile) : [], [authStatus, authenticatedAccessReady, accessProfile])
  const permissionPages = useMemo(() => authenticatedAccessReady
    ? Object.keys(pageInfo).filter((page) => canAccessPage(accessProfile, page))
    : [], [authenticatedAccessReady, accessProfile])
  const availablePages = useMemo(() => authStatus === 'demo' ? Object.keys(pageInfo) : permissionPages.filter((page) => {
    const scope = getDepartmentScope(accessProfile, permissionsForPage(page, allowedReportKeys))
    return scope === null || scope.length > 0
  }), [authStatus, permissionPages, accessProfile, allowedReportKeys])
  const activeView = availablePages.includes(activePage) ? activePage : availablePages[0] || 'executive'
  const pageDepartmentScope = useMemo(() => authenticatedAccessReady
    ? getDepartmentScope(accessProfile, permissionsForPage(activeView, allowedReportKeys))
    : null, [authenticatedAccessReady, accessProfile, activeView, allowedReportKeys])
  const effectiveDepartment = useMemo(() => pageDepartmentScope === null
    ? department
    : pageDepartmentScope.includes(department) ? department : pageDepartmentScope[0] || 'All departments', [pageDepartmentScope, department])
  const importedModel = useMemo(() => createHrModel(stagedImports), [stagedImports])
  const stagedCompanyRows = useMemo(() => ['employeeMaster', 'employeeHistory', 'recruitment', 'contractManpower', 'hrBudget'].flatMap((category) => stagedImports[category]?.rows || []), [stagedImports])
  const latestStagedAt = Object.values(stagedImports).reduce((latest, stage) => !latest || stage.stagedAt > latest.stagedAt ? stage : latest, null)
  const displayedDataTimestamp = dataSource === 'demo'
    ? { dateTime: DEMO_DATA_LOADED_AT, label: DEMO_DATA_LOADED_AT_LABEL, context: 'Demo data loaded' }
    : latestStagedAt?.stagedAt
      ? { dateTime: latestStagedAt.stagedAt, label: latestStagedAt.stagedAtLabel || latestStagedAt.stagedAt, context: 'Last successful import' }
      : null
  const companyOptions = useMemo(() => {
    const companies = dataSource === 'demo' ? companiesList : stagedCompanyRows.map((row) => row.company).filter(Boolean)
    const hasUnassigned = dataSource === 'imported' && stagedCompanyRows.some((row) => !row.company)
    return ['All companies', ...new Set(companies), ...(hasUnassigned ? ['Not specified'] : [])]
  }, [dataSource, stagedCompanyRows])
  const effectiveCompany = companyOptions.includes(company) ? company : 'All companies'
  const filters = useMemo(() => ({ department: fixedDepartment(effectiveDepartment), location, employmentType, company: effectiveCompany }), [effectiveDepartment, location, employmentType, effectiveCompany])
  const importedMonths = useMemo(() => getImportedAvailableMonths(importedModel), [importedModel])
  const reportingMonth = dataSource === 'imported' && importedMonths.length && !importedMonths.includes(selectedMonth) ? importedMonths.at(-1) : selectedMonth
  const reportYear = Number(reportingMonth.slice(0, 4))
  const reportMonthNumber = Number(reportingMonth.slice(5, 7))
  const lastDayOfMonth = new Date(reportYear, reportMonthNumber, 0).getDate()
  const reportingDate = selectedDate.startsWith(`${reportingMonth}-`) ? selectedDate : `${reportingMonth}-${String(lastDayOfMonth).padStart(2, '0')}`
  const financialYearOptions = REPORTING_MONTHS.map((label, index) => ({ label, value: index + 1 }))
  const monthlyMetrics = useMemo(() => dataSource === 'imported'
    ? getImportedMonthMetrics(importedModel, reportingMonth, filters, reportingDate, { financialYearStartMonth })
    : null, [dataSource, importedModel, reportingMonth, reportingDate, filters, financialYearStartMonth])
  const importReadiness = useMemo(() => dataSource === 'imported'
    ? getImportedDashboardReadiness(importedModel, reportingMonth, { financialYearStartMonth })
    : null, [dataSource, importedModel, reportingMonth, financialYearStartMonth])
  const notificationItems = useMemo(() => {
    const items = []
    if (dataSource === 'imported' && importReadiness && !importReadiness.ready) {
      importReadiness.reasons.forEach((reason, index) => items.push({
        id: `readiness-${reportingMonth}-${index}`,
        title: `Imported data · ${reportingMonth}`,
        detail: reason,
        actionPage: 'dataQuality',
      }))
    }
    Object.entries(stagedImports).forEach(([categoryId, stage]) => {
      const issueCount = (stage.summary?.rejectedRows || 0) + (stage.summary?.warningCount || 0)
      if (!issueCount) return
      const label = IMPORT_CATEGORIES.find((item) => item.id === categoryId)?.label || categoryId
      items.push({
        id: `validation-${categoryId}-${stage.stagedAt}`,
        title: `${label} validation needs review`,
        detail: `${stage.summary.rejectedRows || 0} rejected rows and ${stage.summary.warningCount || 0} warnings in the latest staged batch.`,
        actionPage: 'dataImport',
      })
    })
    return items
  }, [dataSource, importReadiness, reportingMonth, stagedImports])
  const employees = useMemo(() => dataSource === 'imported'
    ? monthlyMetrics.headcount.activeEmployees
    : getFilteredEmployees({ monthValue: selectedMonth, dateValue: selectedDate, financialYearStartMonth, ...filters }), [dataSource, monthlyMetrics, selectedMonth, selectedDate, filters, financialYearStartMonth])
  const trend = useMemo(() => dataSource === 'imported' ? getImportedTrendData(importedModel, filters, { financialYearStartMonth }) : getTrendData(filters), [dataSource, importedModel, filters, financialYearStartMonth])
  const employeeDirectoryRows = useMemo(() => {
    const sourceRows = dataSource === 'imported'
      ? getImportedEmployeeDirectory(importedModel, reportingDate, filters).map((employee) => ({ ...employee, id: employee.employeeId, name: employee.employeeName }))
      : demoEmployees
    return sourceRows
      .filter((employee) => (!filters.department || filters.department === 'All departments' || employee.department === filters.department) &&
        (!filters.location || filters.location === 'All locations' || employee.location === filters.location) &&
        (!filters.company || filters.company === 'All companies' || (filters.company === 'Not specified' ? !employee.company : employee.company === filters.company)) &&
        (!filters.employmentType || filters.employmentType === 'All employment types' || employee.employmentType === filters.employmentType))
      .map((employee) => ({
        ...employee,
        status: employee.hireDate > reportingDate ? 'Not yet joined' : employee.exitDate && employee.exitDate <= reportingDate ? 'Exited' : 'Active',
      }))
  }, [dataSource, importedModel, filters, reportingDate])
  const departmentData = useMemo(() => getDepartmentData(employees), [employees])
  const reportingMonths = dataSource === 'imported' && importedMonths.length
    ? importedMonths.map((value) => ({ label: value, value }))
    : dataSource === 'demo' ? months : [{ label: 'No imported reporting periods', value: reportingMonth }]
  const dateMin = dataSource === 'imported' && importedMonths.length ? `${importedMonths[0]}-01` : '2025-01-01'
  const maxMonth = dataSource === 'imported' && importedMonths.length ? importedMonths.at(-1) : '2025-12'
  const dateMax = `${maxMonth}-${String(new Date(Number(maxMonth.slice(0, 4)), Number(maxMonth.slice(5, 7)), 0).getDate()).padStart(2, '0')}`
  const canReadIncrements = authStatus === 'demo' || (authenticatedAccessReady && hasPermission(accessProfile, 'increments.read'))
  const canReadPayroll = authStatus === 'demo' || (authenticatedAccessReady && hasPermission(accessProfile, 'payroll.read'))
  const canReadLeave = authStatus === 'demo' || (authenticatedAccessReady && hasPermission(accessProfile, 'leave.read'))
  const canReadRecruitment = authStatus === 'demo' || (authenticatedAccessReady && hasPermission(accessProfile, 'recruitment.read'))
  const getPeriodMetrics = (month, selectedFilters, date, metricOptions = {}) => {
    const selectedFinancialYearStart = metricOptions.financialYearStartMonth || financialYearStartMonth
    if (dataSource === 'demo') return getMonthMetrics(month, selectedFilters, date, { financialYearStartMonth: selectedFinancialYearStart })
    const metrics = getImportedMonthMetrics(importedModel, month, selectedFilters, date, { projectCostBasis: metricOptions.projectCostBasis || projectCostBasis, financialYearStartMonth: selectedFinancialYearStart })
    const recruitment = canReadRecruitment ? getPlanningReport(importedModel, 'recruitment', month, date, selectedFilters) : null
    return {
      headcount: metrics.headcount.closing,
      openingHeadcount: metrics.headcount.opening,
      headcountComplete: metrics.headcount.complete,
      payroll: metrics.payroll.gross,
      payrollAnnualCtc: metrics.payroll.annualCtc,
      payrollDepartmentData: metrics.payroll.byDepartment,
      payrollComponentTotals: metrics.payroll.componentTotals,
      payrollComponentFields: metrics.payroll.componentFields,
      missingAnnualCtcCount: metrics.payroll.missingAnnualCtcCount,
      attendanceAveragePercentage: metrics.attendance.averagePercentage,
      attendanceLopDays: metrics.attendance.lopDays,
      attendanceDepartmentData: metrics.attendance.byDepartment,
      leaveAccess: canReadLeave,
      leaveUtilisationPercentage: canReadLeave ? metrics.leave.utilisationPercentage : null,
      leaveDepartmentData: canReadLeave ? metrics.leave.byDepartment : [],
      leaveComplete: canReadLeave && metrics.leave.complete,
      leaveMissingEmployeeCount: canReadLeave ? metrics.leave.missingEmployeeCount : null,
      leaveMissingBalanceCount: canReadLeave ? metrics.leave.missingBalanceCount : null,
      leaveBalanceMismatchCount: canReadLeave ? metrics.leave.balanceMismatchCount : null,
      leaveAvailableDays: canReadLeave ? metrics.leave.availableDays : null,
      incrementAccess: canReadIncrements,
      incrementMonthlyCostImpact: canReadIncrements ? metrics.increments.monthlyCostImpact : null,
      incrementAnnualCostImpact: canReadIncrements ? metrics.increments.annualCostImpact : null,
      incrementAveragePercent: canReadIncrements ? metrics.increments.averagePercentage : null,
      incrementApprovedCount: canReadIncrements ? metrics.increments.approvedCount : null,
      incrementPendingCount: canReadIncrements ? metrics.increments.pendingCount : null,
      incrementRejectedCount: canReadIncrements ? metrics.increments.rejectedCount : null,
      incrementDepartmentData: canReadIncrements ? metrics.increments.byDepartment : [],
      incrementApprovedRows: canReadIncrements ? metrics.increments.approvedRows : [],
      incrementRows: canReadIncrements ? metrics.increments.rows : [],
      incrementComplete: canReadIncrements && metrics.increments.complete,
      incrementBudget: canReadIncrements ? metrics.increments.budget : null,
      incrementBudgetComplete: canReadIncrements && metrics.increments.budgetComplete,
      incrementBudgetVariance: canReadIncrements ? metrics.increments.budgetVariance : null,
      incrementBudgetFiltersSupported: canReadIncrements && metrics.increments.budgetFiltersSupported,
      incrementAnalytics: canReadIncrements ? metrics.increments : null,
      projectAllocationCost: metrics.projects.allocationWeightedCost,
      projectAllocationCostAvailable: metrics.projects.costAvailable,
      projectAllocationCostBasis: metrics.projects.costBasisId,
      projectAllocationCostBasisLabel: metrics.projects.costBasisLabel,
      projectAllocationData: metrics.projects.byProject,
      projectAllocationRows: metrics.projects.allocationRows,
      projectAllocatedFte: metrics.projects.allocatedFte,
      projectEmployeeCount: metrics.projects.uniqueEmployees,
      projectTransferCount: metrics.projects.projectTransfers,
      payrollComplete: metrics.payroll.complete && metrics.payroll.missingEmployeeCount === 0,
      recruitmentAvailable: Boolean(recruitment && importedModel.recruitment.some((row) => row.reportingMonth === month)),
      recruitmentComplete: recruitment?.complete ?? false,
      recruitmentOpenPositions: recruitment?.metrics.openPositions ?? null,
      active: metrics.headcount.activeEmployees,
      joiners: metrics.headcount.joinerEmployees,
      exits: metrics.headcount.exitEmployees,
    }
  }
  const projectAssignments = dataSource === 'imported' ? employees.flatMap((employee) => employee.projectAssignments.length
    ? employee.projectAssignments.map((assignment) => ({ ...employee, id: `${employee.id}-${assignment.projectId}`, project: assignment.project, allocation: assignment.allocationPercentage }))
    : [{ ...employee, id: `${employee.id}-unallocated`, project: 'Unallocated', allocation: 0 }]) : employees
  const [title, subtitle] = pageInfo[activeView]
  const planningPage = ['recruitment', 'contracts', 'budget'].includes(activeView)
  const employeeMasterPage = activeView === 'employeeMaster'
  const planningCategory = activeView === 'recruitment' ? 'recruitment' : activeView === 'contracts' ? 'contractManpower' : 'hrBudget'
  const planningRecordCount = dataSource === 'imported' && planningPage
    ? importedModel[planningCategory].filter((row) => row.reportingMonth === reportingMonth &&
      (effectiveDepartment === 'All departments' || row.department === effectiveDepartment) &&
      (effectiveCompany === 'All companies' || (effectiveCompany === 'Not specified' ? !row.company : row.company === effectiveCompany)) &&
      (activeView !== 'contracts' || location === 'All locations' || !row.location || row.location === location)).length
    : 0
  const monthLabel = dataSource === 'imported' ? reportingMonth : months.find((month) => month.value === selectedMonth)?.label || ''
  const departmentOptions = dataSource === 'imported' ? [...new Set([...importedModel.employees.values(), ...importedModel.employeeHistory].map((employee) => employee.department).filter(Boolean))].sort() : departmentsList
  const locationOptions = dataSource === 'imported' ? [...new Set([...importedModel.employees.values(), ...importedModel.employeeHistory].map((employee) => employee.location).filter(Boolean))].sort() : locationsList
  const employmentOptions = dataSource === 'imported' ? [...new Set([...importedModel.employees.values(), ...importedModel.employeeHistory].map((employee) => employee.employmentType).filter(Boolean))].sort() : employmentTypesList
  const changeDataSource = (value) => {
    setDataSource(value)
    setDepartment('All departments')
    setLocation('All locations')
    setEmploymentType('All employment types')
    setCompany('All companies')
  }
  const sourceLabel = dataSource === 'imported' ? 'Imported reporting rows Â· staged in this browser tab' : 'All employee records shown are synthetic demo data.'
  const updateMonth = (value) => {
    const [year, month] = value.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    setSelectedMonth(value)
    setSelectedDate(`${value}-${String(lastDay).padStart(2, '0')}`)
  }
  const updateDate = (value) => {
    if (!value) return
    setSelectedDate(value)
    setSelectedMonth(value.slice(0, 7))
  }
  const resetFilters = () => {
    setDepartment('All departments')
    setLocation('All locations')
    setEmploymentType('All employment types')
    setCompany('All companies')
    setFinancialYearStartMonth(4)
    const defaultMonth = dataSource === 'imported' ? importedMonths.at(-1) : '2025-12'
    if (defaultMonth) updateMonth(defaultMonth)
  }

  const visibleDepartmentOptions = pageDepartmentScope ?? departmentOptions

  const signOut = async () => {
    setAuthActionError('')
    if (authStatus === 'authenticated' && supabase) {
      const { error } = await supabase.auth.signOut()
      if (error) {
        setAuthActionError('Sign out failed. Retry before leaving this session.')
        return
      }
    }
    sessionStorage.removeItem('peoplepulse-demo-mode')
    setStagedImports({})
    setImportHistory([])
    setImportRollback(null)
    setDataSource('demo')
    setDepartment('All departments')
    setAccessProfile(null)
    setAccessIdentity('')
    setAccessStatus('idle')
    accessIdentityRef.current = ''
    setAuthSession(null)
    setAuthStatus('anonymous')
  }

  const recordImportStaging = (entry, previousStage) => {
    const historyEntry = { ...entry, id: `${entry.category}:${entry.stagedAt}`, status: 'Staged' }
    setImportHistory((current) => [historyEntry, ...current].slice(0, 50))
    setImportRollback({ historyId: historyEntry.id, category: entry.category, previousStage })
  }

  const rollbackLastImport = () => {
    if (!importRollback) return
    const label = IMPORT_CATEGORIES.find((item) => item.id === importRollback.category)?.label || importRollback.category
    if (!globalThis.confirm(`Undo the latest ${label} staging action and restore its previous in-memory data?`)) return
    setStagedImports((current) => rollbackImportStage(current, importRollback.category, importRollback.previousStage))
    setImportHistory((current) => current.map((entry) => entry.id === importRollback.historyId ? { ...entry, status: 'Rolled back' } : entry))
    setImportRollback(null)
  }

  const discardRollbackForCategory = (categoryId) => setImportRollback((current) => current?.category === categoryId ? null : current)

  if (authStatus === 'loading') return <main className="login-page"><div className="source-mode-empty">Checking organisation session…</div></main>
  if (authStatus === 'anonymous' || authStatus === 'recovery') {
    return <Login
      recoveryMode={authStatus === 'recovery'}
      onAuthenticated={(session) => { setAuthSession(session); setAuthStatus('authenticated') }}
      onRecoveryComplete={() => setAuthStatus('authenticated')}
      onDemoLogin={() => { sessionStorage.setItem('peoplepulse-demo-mode', 'true'); setAuthStatus('demo') }}
    />
  }

  if (accessLoading) return <main className="login-page"><div className="source-mode-empty">Checking your access permissions…</div></main>
  if (authenticated && (accessStatus === 'error' || (authenticatedAccessReady && !availablePages.length))) {
    return <main className="login-page"><section className="login-card"><div className="login-intro"><p className="login-eyebrow">HR ANALYTICS WORKSPACE</p><h1>Access not available</h1><p>{accessStatus === 'error' ? 'Your role permissions could not be verified. Contact your PeoplePulse administrator.' : 'This account has no active role with a resolvable data scope. Contact your PeoplePulse administrator.'}</p></div><button className="login-submit" type="button" onClick={signOut}>Sign out</button></section></main>
  }

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activeView}
        onNavigate={(page) => { if (availablePages.includes(page)) setActivePage(page) }}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        availablePages={availablePages}
      />
      <main className={`main-content ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open menu" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
          <div className="breadcrumb"><span>People analytics</span><i>/</i><b>{title}</b></div>
          <div className="topbar-right">
            <label className="topbar-source"><span>Source</span><select value={dataSource} onChange={(event) => changeDataSource(event.target.value)} aria-label="Dashboard data source"><option value="demo">Demo Data</option>{canImport && <option value="imported">Imported Data</option>}</select></label>
            <span className={`data-badge ${dataSource === 'imported' ? 'staging-badge' : ''}`}><i /> {dataSource === 'demo' ? 'Demo data' : importReadiness?.ready ? 'Imported data' : planningPage ? 'Imported planning data' : 'Staging only'}</span>
            <NotificationsCenter items={notificationItems} onNavigate={(page) => { if (availablePages.includes(page)) setActivePage(page) }} />
            <HelpCenter onNavigate={(page) => { if (availablePages.includes(page)) setActivePage(page) }} />
            <div className="user-avatar">{authStatus === 'demo' ? 'D' : (authSession?.user?.email || 'U').slice(0, 1).toUpperCase()}</div>
            <div className="user-copy"><strong>{authStatus === 'demo' ? 'Synthetic Demo' : authSession?.user?.email || 'Signed in'}</strong><small>{authStatus === 'demo' ? 'Fictional sample data' : accessProfile?.roleLabel || 'Authenticated account'}</small></div>
            {authActionError && <span className="auth-action-error" role="alert">{authActionError}</span>}
            <button className="logout-button" onClick={signOut} aria-label="Sign out"><LogOut size={15} /><span>Sign out</span></button>
          </div>
        </header>
        <div className="page-content">
          <div className="page-header">
            <div><div className="eyebrow">PEOPLE PULSE <span>Â·</span> {activeView === 'dataImport' ? 'DATA IMPORT' : dataSource === 'imported' ? 'IMPORTED DATA' : monthLabel.toUpperCase()}</div><h1>{title}</h1><p>{subtitle}</p></div>
            <div className="page-header-actions"><span className="updated-note" title={displayedDataTimestamp ? `${displayedDataTimestamp.context}: ${displayedDataTimestamp.label}` : 'No imported data has been staged in this tab.'}><span className="status-dot" />{displayedDataTimestamp ? <>{displayedDataTimestamp.context} · <time dateTime={displayedDataTimestamp.dateTime}>{displayedDataTimestamp.label}</time></> : 'No imported data staged'}</span></div>
          </div>
          {activeView === 'dataImport' ? <Suspense fallback={<div className="source-mode-empty">Loading Data Import Centre…</div>}><DataImportCenter dataSource={dataSource} onDataSourceChange={changeDataSource} stagedImports={stagedImports} setStagedImports={setStagedImports} importHistory={importHistory} importRollback={importRollback} onImportStaged={recordImportStaging} onRollback={rollbackLastImport} onStagedRemoved={discardRollbackForCategory} /></Suspense> : dataSource === 'imported' && !importReadiness.ready && !planningPage && !employeeMasterPage && activeView !== 'dataQuality' ? (
            <section className="source-mode-empty">
              <div className="source-mode-icon"><Database size={22} /></div>
              <p className="eyebrow">IMPORTED DATA Â· {reportingMonth}</p>
              <h2>Imported dashboard is waiting for complete, verified sources</h2>
              <p>No imported values have been combined with demo data. Complete the following checks in Data Import before this reporting period can power the dashboard.</p>
              <ul className="readiness-reasons">{importReadiness.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              <div className="source-stage-list">{IMPORT_CATEGORIES.map((item) => <div key={item.id}><span>{item.label}</span><b>{stagedImports[item.id]?.rows.length || 0} staged rows</b></div>)}</div>
              <button type="button" className="stage-button" onClick={() => setActivePage('dataImport')}>Open Data Import</button>
            </section>
          ) : <>
          <div className="filter-bar">
            <div className="filter-label"><span>Filters</span><i /></div>
            <FilterSelect label="Month" icon={CalendarDays} value={reportingMonth} options={reportingMonths} onChange={updateMonth} />
            <FilterSelect label="Financial year starts" icon={CalendarDays} value={financialYearStartMonth} options={financialYearOptions} onChange={(value) => setFinancialYearStartMonth(Number(value))} />
            <DateFilter value={reportingDate} onChange={updateDate} min={dateMin} max={dateMax} />
            <span className="filter-divider" />
            <FilterSelect label="Department" value={effectiveDepartment} options={pageDepartmentScope ? visibleDepartmentOptions : ['All departments', ...visibleDepartmentOptions]} onChange={setDepartment} />
            <FilterSelect label="Company" value={effectiveCompany} options={companyOptions} onChange={setCompany} />
            <FilterSelect label="Location" icon={MapPin} value={location} options={['All locations', ...locationOptions]} onChange={setLocation} />
            <FilterSelect label="Employment type" value={employmentType} options={['All employment types', ...employmentOptions]} onChange={setEmploymentType} />
            <button type="button" className="filter-reset" onClick={resetFilters}>Reset filters</button>
            <div className="filter-spacer" />
            <span className="filter-result"><b>{activeView === 'dataQuality' ? Object.keys(stagedImports).length : planningPage ? planningRecordCount : employeeMasterPage ? employeeDirectoryRows.length : employees.length}</b> {activeView === 'dataQuality' ? 'staged categories' : planningPage ? 'planning records' : 'employees'}</span>
          </div>
          {employeeMasterPage && dataSource === 'imported' ? <div className="synthetic-banner imported-source-banner"><span className="banner-shield"><Check size={14} /></span><span><b>Imported Employee Master</b> — only staged roster rows are shown. Completeness: {importedModel.employeeMasterAsOf ? `confirmed as of ${importedModel.employeeMasterAsOf}` : 'not confirmed'}.</span></div> : planningPage && dataSource === 'imported' ? <div className="synthetic-banner imported-source-banner"><span className="banner-shield"><Check size={14} /></span><span><b>Imported planning data</b> — results use staged rows for {reportingMonth}; confirm each source month before treating totals as complete.</span></div> : activeView === 'dataQuality' ? null : dataSource === 'demo' ? <div className="synthetic-banner">
            <span className="banner-shield"><Check size={14} /></span>
            <span><b>Synthetic demo data</b> â€” all employee records and metrics are fictional and generated for demonstration.</span>
          </div> : <div className="synthetic-banner imported-source-banner"><span className="banner-shield"><Check size={14} /></span><span><b>Imported reporting period verified</b> — only staged imported sources are shown. Trend points for incomplete historical periods are omitted. {!importedModel.completeness.employeeHistory ? 'Past-period department, location, and employment filters use roster attributes until a complete Employee History is staged.' : 'Effective-dated Employee History is applied to past-period workforce attributes.'}{importReadiness.metrics.payroll.missingAnnualCtcCount > 0 ? ' Annual CTC is shown as unavailable where it was not supplied.' : ''}</span></div>}
          {employees.length === 0 && !employeeMasterPage && activeView !== 'dataQuality' && <div className="empty-filter-state"><Search size={18} /><div><strong>No employees in this selection</strong><p>Try changing the department or location filter to see sample analytics.</p></div></div>}
          <Suspense fallback={<div className="source-mode-empty">Loading dashboard module…</div>}>
            {activeView === 'dataQuality'
              ? <DataQualityCenter model={importedModel} stagedImports={stagedImports} selectedMonth={reportingMonth} selectedDate={reportingDate} filters={filters} canReadIncrements={canReadIncrements} financialYearStartMonth={financialYearStartMonth} />
              : employeeMasterPage
              ? <EmployeeDirectory employees={employeeDirectoryRows} asOfDate={reportingDate} sourceLabel={sourceLabel} rosterComplete={dataSource === 'demo' || Boolean(importedModel.employeeMasterAsOf)} />
              : planningPage
              ? <PlanningModules page={activeView} dataSource={dataSource} model={importedModel} selectedMonth={reportingMonth} selectedDate={reportingDate} filters={filters} canReadIncrements={canReadIncrements} />
              : activeView === 'reports'
              ? <ReportsCenter employees={employees} trends={trend} departments={departmentData} projectAssignments={projectAssignments} importedModel={importedModel} dataSource={dataSource} selectedMonth={reportingMonth} selectedDate={reportingDate} filters={filters} getPeriodMetrics={getPeriodMetrics} sourceLabel={sourceLabel} allowedReports={allowedReportKeys} incrementBandLimits={incrementBandLimits} />
              : <DashboardModules page={activeView} employees={employees} trends={trend} departments={departmentData} selectedMonth={reportingMonth} selectedDate={reportingDate} filters={filters} getPeriodMetrics={getPeriodMetrics} financialYearStartMonth={financialYearStartMonth} sourceLabel={sourceLabel} isImported={dataSource === 'imported'} projectAssignments={projectAssignments} canReadEmployees={authStatus === 'demo' || hasPermission(accessProfile, 'employee.read')} canReadPayroll={canReadPayroll} canReadLeave={canReadLeave} projectCostBasis={projectCostBasis} onProjectCostBasisChange={setProjectCostBasis} incrementBandLimits={incrementBandLimits} onIncrementBandLimitsChange={setIncrementBandLimits} />}
          </Suspense>
          </>}
          <footer className="app-footer"><span>PeoplePulse <i>Â·</i> HR Analytics</span><span>{dataSource === 'imported' ? 'Imported source · no file upload to a server' : 'For demonstration purposes only · No live employee data'}</span></footer>
        </div>
      </main>
    </div>
  )
}

export default App
