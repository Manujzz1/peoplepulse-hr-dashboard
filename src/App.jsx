import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays, Check, ChevronDown, Database, LogOut, MapPin, Menu, Search,
} from 'lucide-react'

import Sidebar from './components/Sidebar'
import Login from './components/Login'
import HelpCenter from './components/HelpCenter'
import NotificationsCenter from './components/NotificationsCenter'
import AppErrorBoundary from './components/AppErrorBoundary'
import { supabase, supabaseConfigured } from './auth/supabaseClient'
import { authStatusForEvent, authStatusForInitialSession, shouldClearPrivateStateOnAuthChange } from './auth/sessionStatus'
import { canAccessPage, getAllowedReportKeys, getDepartmentScope, hasPermission, loadAccessProfile, PAGE_PERMISSIONS, REPORT_PERMISSIONS } from './auth/accessControl'
import { loadLiveWorkspace, scopedLiveStages } from './data/liveWorkspace'
import { TEMPORARY_SAMPLE_DATA } from './data/sampleData'
import { inspectImportBatch, submitImportBatch, transitionImportBatch } from './import/remoteImport'
const DataImportCenter = lazy(() => import('./components/DataImportCenter'))
const DashboardModules = lazy(() => import('./components/DashboardModules'))
const ExecutiveDashboard = lazy(() => import('./components/ExecutiveDashboard'))
const executiveSampleMode = import.meta.env.VITE_EXECUTIVE_SAMPLE_MODE
const executiveSampleHostAllowed = __EXECUTIVE_SAMPLE_ALLOWED__ || (__EXECUTIVE_SAMPLE_HOST__ && window.location.hostname === __EXECUTIVE_SAMPLE_HOST__)
const ExecutiveSamplePreview = executiveSampleHostAllowed && (executiveSampleMode === 'true' || (import.meta.env.DEV && executiveSampleMode !== 'false'))
  ? lazy(() => import('./components/ExecutiveSamplePreview')) : null
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
import { getDepartmentData } from './data/demoData'
import './App.css'

const liveImportsEnabled = import.meta.env.VITE_ENABLE_LIVE_IMPORTS === 'true'

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
  const [authStatus, setAuthStatus] = useState(supabaseConfigured ? 'loading' : 'anonymous')
  const [authSession, setAuthSession] = useState(null)
  const [authActionError, setAuthActionError] = useState('')
  const [accessProfile, setAccessProfile] = useState(null)
  const [accessStatus, setAccessStatus] = useState('idle')
  const [accessIdentity, setAccessIdentity] = useState('')
  const accessIdentityRef = useRef('')
  const [activePage, setActivePage] = useState('executive')
  const [dataSource, setDataSource] = useState('live')
  const [liveWorkspaceState, setLiveWorkspaceState] = useState({ status: 'idle', workspace: null, error: null })
  const [liveRetry, setLiveRetry] = useState(0)
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
  const [organization, setOrganization] = useState('All organizations')
  const [projectCostBasis, setProjectCostBasis] = useState('hybrid')
  const [incrementBandLimits, setIncrementBandLimits] = useState(DEFAULT_INCREMENT_BAND_LIMITS)
  const [collapsed, setCollapsed] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const previousAuthStatus = useRef(authStatus)
  useEffect(() => {
    if (shouldClearPrivateStateOnAuthChange(previousAuthStatus.current, authStatus)) {
      setStagedImports({})
      setImportHistory([])
      setImportRollback(null)
      setLiveWorkspaceState({ status: 'idle', workspace: null, error: null })
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
        setAuthStatus(authStatusForInitialSession(null, 'loading'))
        return
      }
      setAuthSession(data.session)
      setAuthStatus((current) => authStatusForInitialSession(data.session, current))
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
        setLiveWorkspaceState({ status: 'idle', workspace: null, error: null })
      }
      if (!hasPermission(profile, 'imports.write')) {
        setStagedImports({})
        setImportHistory([])
        setImportRollback(null)
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
  const liveLoadKey = dataSource === 'live' && authenticatedAccessReady && supabase ? `${currentAccessIdentity}:${liveRetry}` : ''
  const currentLiveWorkspaceStatus = liveWorkspaceState.requestKey === liveLoadKey ? liveWorkspaceState.status : 'loading'
  useEffect(() => {
    if (dataSource !== 'live' || !authenticated || !authenticatedAccessReady || !supabase) return undefined
    let active = true
    const requestKey = `${currentAccessIdentity}:${liveRetry}`
    loadLiveWorkspace(supabase, accessProfile).then((workspace) => {
      if (active) setLiveWorkspaceState({ requestKey, status: 'ready', workspace, error: null })
    }).catch((error) => {
      if (active) setLiveWorkspaceState({ requestKey, status: 'error', workspace: null, error })
    })
    return () => { active = false }
  }, [dataSource, authenticated, authenticatedAccessReady, accessProfile, currentAccessIdentity, liveRetry])
  const canImport = authenticatedAccessReady && hasPermission(accessProfile, 'imports.write')
  const allowedReportKeys = useMemo(() => authenticatedAccessReady ? getAllowedReportKeys(accessProfile) : [], [authenticatedAccessReady, accessProfile])
  const permissionPages = useMemo(() => authenticatedAccessReady
    ? Object.keys(pageInfo).filter((page) => canAccessPage(accessProfile, page))
    : [], [authenticatedAccessReady, accessProfile])
  const availablePages = useMemo(() => permissionPages.filter((page) => {
    const scope = getDepartmentScope(accessProfile, permissionsForPage(page, allowedReportKeys))
    return scope === null || scope.length > 0
  }), [permissionPages, accessProfile, allowedReportKeys])
  const activeView = availablePages.includes(activePage) ? activePage : availablePages[0] || 'executive'
  const [executiveSampleSelected, setExecutiveSampleSelected] = useState(true)
  const [dashboardOptionsExpanded, setDashboardOptionsExpanded] = useState(false)
  const [sampleFilterCount, setSampleFilterCount] = useState(0)
  const mobileMenuButton = useRef(null)
  const showExecutiveSample = activeView === 'executive' && ExecutiveSamplePreview && executiveSampleSelected
  const pageDepartmentScope = useMemo(() => authenticatedAccessReady
    ? getDepartmentScope(accessProfile, permissionsForPage(activeView, allowedReportKeys))
    : null, [authenticatedAccessReady, accessProfile, activeView, allowedReportKeys])
  const effectiveDepartment = useMemo(() => pageDepartmentScope === null
    ? department
    : pageDepartmentScope.includes(department) ? department : pageDepartmentScope[0] || 'All departments', [pageDepartmentScope, department])
  const stagedCompanyRows = useMemo(() => ['employeeMaster', 'employeeHistory', 'recruitment', 'contractManpower', 'hrBudget'].flatMap((category) => stagedImports[category]?.rows || []), [stagedImports])
  const latestStagedAt = Object.values(stagedImports).reduce((latest, stage) => !latest || stage.stagedAt > latest.stagedAt ? stage : latest, null)
  const displayedDataTimestamp = dataSource === 'live' && liveWorkspaceState.workspace?.loadedAt
      ? { dateTime: liveWorkspaceState.workspace.loadedAt, label: new Date(liveWorkspaceState.workspace.loadedAt).toLocaleString(), context: 'Live data refreshed' }
    : latestStagedAt?.stagedAt
      ? { dateTime: latestStagedAt.stagedAt, label: latestStagedAt.stagedAtLabel || latestStagedAt.stagedAt, context: 'Last successful import' }
      : null
  const companyOptions = useMemo(() => {
    const companies = dataSource === 'live'
      ? (liveWorkspaceState.workspace?.companies || []).filter((row) => organization === 'All organizations' || liveWorkspaceState.workspace.organizations.find((item) => item.id === row.organization_id)?.organization_name === organization).map((row) => row.company_name)
      : stagedCompanyRows.map((row) => row.company).filter(Boolean)
    const hasUnassigned = dataSource === 'imported' && stagedCompanyRows.some((row) => !row.company)
    return ['All companies', ...new Set(companies), ...(hasUnassigned ? ['Not specified'] : [])]
  }, [dataSource, stagedCompanyRows, liveWorkspaceState.workspace, organization])
  const effectiveCompany = companyOptions.includes(company) ? company : 'All companies'
  const workspaceName = effectiveCompany === 'All companies' && companyOptions.length === 2 ? companyOptions[1] : effectiveCompany
  const currentStages = useMemo(() => dataSource === 'live'
    ? scopedLiveStages(liveWorkspaceState.workspace, organization, effectiveCompany)
    : stagedImports, [dataSource, liveWorkspaceState.workspace, organization, effectiveCompany, stagedImports])
  const hasSampleData = dataSource === 'live' && Boolean(currentStages.employeeMaster?.temporarySample)
  const importedModel = useMemo(() => createHrModel(currentStages), [currentStages])
  const filters = useMemo(() => ({ organization, department: fixedDepartment(effectiveDepartment), location, employmentType, company: effectiveCompany }), [organization, effectiveDepartment, location, employmentType, effectiveCompany])
  const importedMonths = useMemo(() => getImportedAvailableMonths(importedModel), [importedModel])
  const reportingMonth = importedMonths.length && !importedMonths.includes(selectedMonth) ? importedMonths.at(-1) : selectedMonth
  const reportYear = Number(reportingMonth.slice(0, 4))
  const reportMonthNumber = Number(reportingMonth.slice(5, 7))
  const lastDayOfMonth = new Date(reportYear, reportMonthNumber, 0).getDate()
  const reportingDate = selectedDate.startsWith(`${reportingMonth}-`) ? selectedDate : `${reportingMonth}-${String(lastDayOfMonth).padStart(2, '0')}`
  const financialYearOptions = REPORTING_MONTHS.map((label, index) => ({ label, value: index + 1 }))
  const monthlyMetrics = useMemo(() => getImportedMonthMetrics(importedModel, reportingMonth, filters, reportingDate, { financialYearStartMonth }), [importedModel, reportingMonth, reportingDate, filters, financialYearStartMonth])
  const importReadiness = useMemo(() => getImportedDashboardReadiness(importedModel, reportingMonth, { financialYearStartMonth }), [importedModel, reportingMonth, financialYearStartMonth])
  const notificationItems = useMemo(() => {
    const items = []
    if (!hasSampleData && !importReadiness.ready) {
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
  }, [hasSampleData, importReadiness, reportingMonth, stagedImports])
  const employees = monthlyMetrics.headcount.activeEmployees
  const trend = useMemo(() => getImportedTrendData(importedModel, filters, { financialYearStartMonth }), [importedModel, filters, financialYearStartMonth])
  const employeeDirectoryRows = useMemo(() => {
    const sourceRows = getImportedEmployeeDirectory(importedModel, reportingDate, filters).map((employee) => ({ ...employee, id: employee.employeeId, name: employee.employeeName }))
    return sourceRows
      .filter((employee) => (!filters.department || filters.department === 'All departments' || employee.department === filters.department) &&
        (!filters.location || filters.location === 'All locations' || employee.location === filters.location) &&
        (!filters.company || filters.company === 'All companies' || (filters.company === 'Not specified' ? !employee.company : employee.company === filters.company)) &&
        (!filters.employmentType || filters.employmentType === 'All employment types' || employee.employmentType === filters.employmentType))
      .map((employee) => ({
        ...employee,
        status: employee.hireDate > reportingDate ? 'Not yet joined' : employee.exitDate && employee.exitDate <= reportingDate ? 'Exited' : 'Active',
      }))
  }, [importedModel, filters, reportingDate])
  const departmentData = useMemo(() => getDepartmentData(employees), [employees])
  const reportingMonths = importedMonths.length
    ? importedMonths.map((value) => ({ label: value, value }))
    : [{ label: dataSource === 'live' ? 'No published reporting periods' : 'No staged reporting periods', value: reportingMonth }]
  const dateMin = importedMonths.length ? `${importedMonths[0]}-01` : '2025-01-01'
  const maxMonth = importedMonths.at(-1) || '2025-12'
  const dateMax = `${maxMonth}-${String(new Date(Number(maxMonth.slice(0, 4)), Number(maxMonth.slice(5, 7)), 0).getDate()).padStart(2, '0')}`
  const canReadIncrements = authenticatedAccessReady && hasPermission(accessProfile, 'increments.read')
  const canReadPayroll = authenticatedAccessReady && hasPermission(accessProfile, 'payroll.read')
  const canReadLeave = authenticatedAccessReady && hasPermission(accessProfile, 'leave.read')
  const canReadRecruitment = authenticatedAccessReady && hasPermission(accessProfile, 'recruitment.read')
  const getPeriodMetrics = (month, selectedFilters, date, metricOptions = {}) => {
    const selectedFinancialYearStart = metricOptions.financialYearStartMonth || financialYearStartMonth
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
  const projectAssignments = employees.flatMap((employee) => employee.projectAssignments.length
    ? employee.projectAssignments.map((assignment) => ({ ...employee, id: `${employee.id}-${assignment.projectId}`, project: assignment.project, allocation: assignment.allocationPercentage }))
    : [{ ...employee, id: `${employee.id}-unallocated`, project: 'Unallocated', allocation: 0 }])
  const [title, subtitle] = pageInfo[activeView]
  const planningPage = ['recruitment', 'contracts', 'budget'].includes(activeView)
  const employeeMasterPage = activeView === 'employeeMaster'
  const planningCategory = activeView === 'recruitment' ? 'recruitment' : activeView === 'contracts' ? 'contractManpower' : 'hrBudget'
  const planningRecordCount = planningPage
    ? importedModel[planningCategory].filter((row) => row.reportingMonth === reportingMonth &&
      (effectiveDepartment === 'All departments' || row.department === effectiveDepartment) &&
      (effectiveCompany === 'All companies' || (effectiveCompany === 'Not specified' ? !row.company : row.company === effectiveCompany)) &&
      (activeView !== 'contracts' || location === 'All locations' || !row.location || row.location === location)).length
    : 0
  const monthLabel = reportingMonth
  const departmentOptions = [...new Set([...importedModel.employees.values(), ...importedModel.employeeHistory].map((employee) => employee.department).filter(Boolean))].sort()
  const locationOptions = [...new Set([...importedModel.employees.values(), ...importedModel.employeeHistory].map((employee) => employee.location).filter(Boolean))].sort()
  const employmentOptions = [...new Set([...importedModel.employees.values(), ...importedModel.employeeHistory].map((employee) => employee.employmentType).filter(Boolean))].sort()
  const changeDataSource = (value) => {
    if (!authenticated || (value !== 'live' && (value !== 'imported' || !canImport))) return
    setDataSource(value)
    setDepartment('All departments')
    setLocation('All locations')
    setEmploymentType('All employment types')
    setCompany('All companies')
    setOrganization('All organizations')
  }
  const submitDatabaseImport = async ({ category, stage, companyId }) => {
    if (!liveImportsEnabled) throw new Error('Live import submissions are disabled in this deployment.')
    if (!supabase || dataSource !== 'live' || !authenticatedAccessReady || !hasPermission(accessProfile, 'imports.write') || !hasPermission(accessProfile, 'imports.read')) {
      throw new Error('A verified live session with import read and write permissions is required.')
    }
    const result = await submitImportBatch({ client: supabase, category, stage, companyId, workspace: liveWorkspaceState.workspace })
    setLiveRetry((count) => count + 1)
    return result
  }
  const transitionDatabaseBatch = async (batch, status) => {
    if (!liveImportsEnabled) throw new Error('Live import workflow actions are disabled in this deployment.')
    if (!supabase || dataSource !== 'live' || !authenticatedAccessReady) throw new Error('A verified live session is required.')
    const neededPermission = { Reviewed: 'imports.review', Approved: 'imports.approve', Published: 'imports.publish', Rejected: 'imports.review' }[status]
    if (!neededPermission || !hasPermission(accessProfile, neededPermission)) throw new Error('Your current role cannot perform that import approval step.')
    if (!(liveWorkspaceState.workspace?.rowsByTable?.batches || []).some((item) => item.id === batch.id)) throw new Error('The batch is outside the currently visible organization scope.')
    const result = await transitionImportBatch(supabase, batch.id, status)
    setLiveRetry((count) => count + 1)
    return result
  }
  const inspectDatabaseBatch = useCallback(async (id, offset) => {
    if (!liveImportsEnabled || !authenticatedAccessReady || !supabase) {
      throw new Error('Import review is unavailable in this session.')
    }
    return inspectImportBatch(supabase, id, offset)
  }, [authenticatedAccessReady])
  const refreshLiveWorkspaceForExport = async () => {
    if (!supabase || !authenticatedAccessReady || dataSource !== 'live') throw new Error('A verified live session is required.')
    const workspace = await loadLiveWorkspace(supabase, accessProfile)
    setLiveWorkspaceState({ requestKey: liveLoadKey, status: 'ready', workspace, error: null })
    return workspace
  }
  const sourceLabel = hasSampleData ? TEMPORARY_SAMPLE_DATA : dataSource === 'live' ? 'Live Supabase data' : 'Local import preview'
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
    setOrganization('All organizations')
    setFinancialYearStartMonth(4)
    const defaultMonth = importedMonths.at(-1) || '2025-12'
    if (defaultMonth) updateMonth(defaultMonth)
  }

  const visibleDepartmentOptions = pageDepartmentScope ?? departmentOptions
  const organizationOptions = ['All organizations', ...(liveWorkspaceState.workspace?.organizations || []).map((row) => row.organization_name)]
  const selectOrganization = (value) => { setOrganization(value); setCompany('All companies') }
  const showReportingFilters = !showExecutiveSample && activeView !== 'dataImport'
    && (currentStages.employeeMaster?.sampleOnly || importReadiness.ready || planningPage || employeeMasterPage || activeView === 'dataQuality')
  const activeFilterCount = showExecutiveSample ? sampleFilterCount : showReportingFilters ? [
    reportingMonth !== (importedMonths.at(-1) || '2025-12'),
    Number(reportingDate.slice(-2)) !== lastDayOfMonth,
    financialYearStartMonth !== 4,
    dataSource === 'live' && organization !== 'All organizations',
    department !== 'All departments' && effectiveDepartment === department,
    effectiveCompany !== 'All companies',
    location !== 'All locations',
    employmentType !== 'All employment types',
  ].filter(Boolean).length : 0

  const signOut = async () => {
    setAuthActionError('')
    if (authStatus === 'authenticated' && supabase) {
      const { error } = await supabase.auth.signOut()
      if (error) {
        setAuthActionError('Sign out failed. Retry before leaving this session.')
        return
      }
    }
    setStagedImports({})
    setImportHistory([])
    setImportRollback(null)
    setDataSource('live')
    setLiveWorkspaceState({ status: 'idle', workspace: null, error: null })
    setOrganization('All organizations')
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
      passwordResetUrl={import.meta.env.VITE_USE_ORIGINAL_PASSWORD_RESET === 'true' ? 'https://peoplepulse-hr-dashboard.vercel.app' : undefined}
      onAuthenticated={(session) => { setDataSource('live'); setAuthSession(session); setAuthStatus('authenticated') }}
      onRecoveryComplete={() => setAuthStatus('authenticated')}
    />
  }

  if (accessLoading) return <main className="login-page"><div className="source-mode-empty">Checking your access permissions…</div></main>
  if (authenticated && (accessStatus === 'error' || (authenticatedAccessReady && !availablePages.length))) {
    return <main className="login-page"><section className="login-card"><div className="login-intro"><p className="login-eyebrow">HR ANALYTICS WORKSPACE</p><h1>Access not available</h1><p>{accessStatus === 'error' ? 'Your role permissions could not be verified. Contact your PeoplePulse administrator.' : 'This account has no active role with a resolvable data scope. Contact your PeoplePulse administrator.'}</p></div><button className="login-submit" type="button" onClick={signOut}>Sign out</button></section></main>
  }

  if (dataSource === 'live' && currentLiveWorkspaceStatus !== 'ready') {
    const failed = currentLiveWorkspaceStatus === 'error'
    const denied = liveWorkspaceState.error?.code === 'UNAUTHORIZED'
    return <main className="login-page"><section className="login-card"><div className="login-intro"><p className="login-eyebrow">LIVE ORGANIZATION DATA</p><h1>{failed ? denied ? 'Live data access is not authorized' : 'Live data could not be loaded' : 'Loading live organization data'}</h1><p>{failed ? denied ? 'Your verified session has no active organization data scope. Contact a PeoplePulse administrator.' : liveWorkspaceState.error?.message || 'The database request failed.' : 'Verifying your session and loading rows allowed by database RLS.'}</p></div>{failed && <div className="login-actions"><button className="login-submit" type="button" onClick={() => setLiveRetry((count) => count + 1)}>Retry live connection</button><button className="logout-button" type="button" onClick={signOut}>Sign out</button></div>}</section></main>
  }
  if (dataSource === 'live' && liveWorkspaceState.workspace && !liveWorkspaceState.workspace.companies.length) {
    return <main className="login-page"><section className="login-card"><div className="login-intro"><p className="login-eyebrow">LIVE ORGANIZATION DATA</p><h1>No company is configured yet</h1><p>Your organization role is valid, but there are no active companies to query. An administrator can configure a company, department, and location through the approved onboarding process.</p></div><div className="login-actions"><button className="logout-button" type="button" onClick={signOut}>Sign out</button></div></section></main>
  }

  return (
    <div className="app-shell">
      <Sidebar
        workspaceName={workspaceName}
        activePage={activeView}
        onNavigate={(page) => { if (availablePages.includes(page)) setActivePage(page) }}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        mobileOpen={mobileOpen}
        onClose={() => { if (mobileOpen) mobileMenuButton.current?.focus(); setMobileOpen(false) }}
        availablePages={availablePages}
        organization={organization}
        organizationOptions={dataSource === 'live' ? organizationOptions : undefined}
        onOrganizationChange={selectOrganization}
      />
      <main className={`main-content ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <header className="topbar">
          <button ref={mobileMenuButton} className="mobile-menu icon-button" aria-label="Open menu" aria-controls="workspace-sidebar" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
          <h1 className="dashboard-title">{title}</h1>
          <div className="topbar-right">
            <button type="button" className="workspace-filter-toggle" aria-expanded={dashboardOptionsExpanded} aria-controls={showExecutiveSample ? 'dashboard-options executive-sample-options' : 'dashboard-options'}
              aria-label={dashboardOptionsExpanded ? 'Collapse dashboard options' : 'Expand dashboard options'} aria-describedby={activeFilterCount > 0 ? 'active-filter-count' : undefined}
              onClick={() => setDashboardOptionsExpanded((value) => !value)}>
              <ChevronDown size={15} aria-hidden="true" />
              {dashboardOptionsExpanded ? 'Collapse dashboard options' : 'Expand dashboard options'}
              {activeFilterCount > 0 && <span id="active-filter-count" className="active-filter-count">{activeFilterCount} active</span>}
            </button>
            <span className="workspace-source-indicator">{showExecutiveSample ? 'Fictional preview' : dataSource === 'live' ? 'Live data' : 'Local preview'}</span>
            {activeView === 'executive' && ExecutiveSamplePreview && <button type="button" className="workspace-filter-toggle" onClick={() => setExecutiveSampleSelected((selected) => !selected)}>{showExecutiveSample ? 'Show workspace data' : 'Show fictional sample'}</button>}
            <span className="data-badge staging-badge"><i /> {showExecutiveSample ? 'Fictional sample preview' : dataSource === 'live' ? hasSampleData ? TEMPORARY_SAMPLE_DATA : 'Live RLS data' : 'Local preview'}</span>
            <div className="user-avatar" role="img" aria-label={authSession?.user?.email || 'Signed in'} title={authSession?.user?.email || 'Signed in'}>{(authSession?.user?.email || 'U').slice(0, 1).toUpperCase()}</div>
            <div className="user-copy"><strong>{authSession?.user?.email || 'Signed in'}</strong><small>{accessProfile?.roleLabel || 'Authenticated account'}</small></div>
            {authActionError && <span className="auth-action-error" role="alert">{authActionError}</span>}
            <button className="logout-button" onClick={signOut} aria-label="Sign out"><LogOut size={15} /><span>Sign out</span></button>
          </div>
        </header>
        <div className="page-content">
          <section id="dashboard-options" aria-label="Dashboard options" hidden={!dashboardOptionsExpanded}>
            <div className="page-header">
              <div><div className="eyebrow">PEOPLE PULSE <span>Â·</span> {showExecutiveSample ? 'FICTIONAL SAMPLE PREVIEW' : activeView === 'dataImport' ? 'DATA IMPORT' : dataSource === 'live' ? 'LIVE DATA' : dataSource === 'imported' ? 'LOCAL PREVIEW' : monthLabel.toUpperCase()}</div><strong className="dashboard-intro-title" aria-hidden="true">{title}</strong><p>{subtitle}</p></div>
              {!showExecutiveSample && <div className="page-header-actions"><span className="updated-note" title={displayedDataTimestamp ? `${displayedDataTimestamp.context}: ${displayedDataTimestamp.label}` : 'No imported data has been staged in this tab.'}><span className="status-dot" />{displayedDataTimestamp ? <>{displayedDataTimestamp.context} · <time dateTime={displayedDataTimestamp.dateTime}>{displayedDataTimestamp.label}</time></> : 'No imported data staged'}</span></div>}
            </div>
            <div className="dashboard-secondary-controls">
              {!showExecutiveSample && <label className="topbar-source"><span>Source</span><select value={dataSource} onChange={(event) => changeDataSource(event.target.value)} aria-label="Dashboard data source">{authenticated && <option value="live">Live organization data</option>}{canImport && <option value="imported">Local import preview</option>}</select></label>}
              <NotificationsCenter items={notificationItems} onNavigate={(page) => { if (availablePages.includes(page)) setActivePage(page) }} />
              <HelpCenter onNavigate={(page) => { if (availablePages.includes(page)) setActivePage(page) }} />
            </div>
            {showReportingFilters && (
            <section className="workspace-filters" aria-label="Reporting filters">
            <div className="filter-bar">
              <FilterSelect label="Month" icon={CalendarDays} value={reportingMonth} options={reportingMonths} onChange={updateMonth} />
              <FilterSelect label="Financial year starts" icon={CalendarDays} value={financialYearStartMonth} options={financialYearOptions} onChange={(value) => setFinancialYearStartMonth(Number(value))} />
              <DateFilter value={reportingDate} onChange={updateDate} min={dateMin} max={dateMax} />
              <span className="filter-divider" />
              {dataSource === 'live' && <FilterSelect label="Organization" value={organization} options={organizationOptions} onChange={selectOrganization} />}
              <FilterSelect label="Department" value={effectiveDepartment} options={pageDepartmentScope ? visibleDepartmentOptions : ['All departments', ...visibleDepartmentOptions]} onChange={setDepartment} />
              <FilterSelect label="Company" value={effectiveCompany} options={companyOptions} onChange={setCompany} />
              <FilterSelect label="Location" icon={MapPin} value={location} options={['All locations', ...locationOptions]} onChange={setLocation} />
              <FilterSelect label="Employment type" value={employmentType} options={['All employment types', ...employmentOptions]} onChange={setEmploymentType} />
              <button type="button" className="filter-reset" onClick={resetFilters}>Reset filters</button>
              <span className="filter-result"><b>{activeView === 'dataQuality' ? Object.keys(stagedImports).length : planningPage ? planningRecordCount : employeeMasterPage ? employeeDirectoryRows.length : employees.length}</b> {activeView === 'dataQuality' ? 'staged categories' : planningPage ? 'planning records' : 'employees'}</span>
            </div>
            </section>
            )}
          </section>
          {showExecutiveSample ? <AppErrorBoundary moduleTitle={title}>
            <Suspense fallback={<div className="source-mode-empty">Loading Executive sample preview…</div>}><ExecutiveSamplePreview optionsExpanded={dashboardOptionsExpanded} onFilterCountChange={setSampleFilterCount} /></Suspense>
          </AppErrorBoundary> : activeView === 'dataImport' ? <Suspense fallback={<div className="source-mode-empty">Loading Data Import Centre…</div>}><DataImportCenter dataSource={dataSource} onDataSourceChange={changeDataSource} stagedImports={stagedImports} setStagedImports={setStagedImports} importHistory={importHistory} importRollback={importRollback} onImportStaged={recordImportStaging} onRollback={rollbackLastImport} onStagedRemoved={discardRollbackForCategory} liveImportsEnabled={liveImportsEnabled} databaseReady={liveImportsEnabled && dataSource === 'live' && currentLiveWorkspaceStatus === 'ready' && authenticatedAccessReady && hasPermission(accessProfile, 'imports.write') && hasPermission(accessProfile, 'imports.read')} databaseCompanies={liveWorkspaceState.workspace?.companies || []} databaseWorkspace={liveWorkspaceState.workspace} databaseBatches={liveWorkspaceState.workspace?.rowsByTable?.batches || []} databasePermissions={accessProfile?.permissions || {}} onSubmitDatabase={submitDatabaseImport} onTransitionBatch={transitionDatabaseBatch} onInspectBatch={inspectDatabaseBatch} /></Suspense> : !currentStages.employeeMaster?.sampleOnly && !importReadiness.ready && !planningPage && !employeeMasterPage && activeView !== 'dataQuality' ? (
            <section className="source-mode-empty">
              <div className="source-mode-icon"><Database size={22} /></div>
              <p className="eyebrow">IMPORTED DATA Â· {reportingMonth}</p>
              <h2>Imported dashboard is waiting for complete, verified sources</h2>
              <p>{dataSource === 'live' ? 'No published live source rows are available for this reporting period.' : 'Local preview rows have not been published. Complete the following checks before the preview can power the dashboard.'}</p>
              <ul className="readiness-reasons">{importReadiness.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              <div className="source-stage-list">{IMPORT_CATEGORIES.map((item) => <div key={item.id}><span>{item.label}</span><b>{currentStages[item.id]?.rows.length || 0} visible rows</b></div>)}</div>
              {dataSource !== 'live' && <button type="button" className="stage-button" onClick={() => setActivePage('dataImport')}>Open Data Import</button>}
            </section>
          ) : <>
          {dataSource === 'live' ? <div className="synthetic-banner imported-source-banner"><span className="banner-shield"><Check size={14} /></span><span><b>{hasSampleData ? TEMPORARY_SAMPLE_DATA : 'Live RLS-backed data'}</b>{hasSampleData ? ' ? fictional ADTL records. Do not use these figures as real HR or payroll data.' : ' ? records are scoped to the authenticated session.'}</span></div> : employeeMasterPage && dataSource === 'imported' ? <div className="synthetic-banner imported-source-banner"><span className="banner-shield"><Check size={14} /></span><span><b>Local Employee Master preview</b> — not published to the database.</span></div> : planningPage && dataSource === 'imported' ? <div className="synthetic-banner imported-source-banner"><span className="banner-shield"><Check size={14} /></span><span><b>Local planning preview</b> — not published to the database.</span></div> : activeView === 'dataQuality' ? null : <div className="synthetic-banner imported-source-banner"><span className="banner-shield"><Check size={14} /></span><span><b>Imported reporting period verified</b> — only staged imported sources are shown. Trend points for incomplete historical periods are omitted. {!importedModel.completeness.employeeHistory ? 'Past-period department, location, and employment filters use roster attributes until a complete Employee History is staged.' : 'Effective-dated Employee History is applied to past-period workforce attributes.'}{importReadiness.metrics.payroll.missingAnnualCtcCount > 0 ? ' Annual CTC is shown as unavailable where it was not supplied.' : ''}</span></div>}
          {employees.length === 0 && !employeeMasterPage && activeView !== 'dataQuality' && <div className="empty-filter-state"><Search size={18} /><div><strong>No employees in this selection</strong><p>{dataSource === 'live' ? 'No published employee rows are visible for this organization, company, and reporting period.' : 'No local preview rows match the selected filters.'}</p></div></div>}
          <AppErrorBoundary key={activeView} moduleTitle={title}>
          <Suspense fallback={<div className="source-mode-empty">Loading dashboard module…</div>}>
            {activeView === 'dataQuality'
              ? <DataQualityCenter model={importedModel} stagedImports={stagedImports} selectedMonth={reportingMonth} selectedDate={reportingDate} filters={filters} canReadIncrements={canReadIncrements} financialYearStartMonth={financialYearStartMonth} />
              : activeView === 'executive'
              ? <ExecutiveDashboard metrics={monthlyMetrics} trends={trend} month={reportingMonth} monthEnd={Number(reportingDate.slice(-2)) === lastDayOfMonth}
                  financialYearStartMonth={financialYearStartMonth} canReadPayroll={canReadPayroll} canReadLeave={canReadLeave} sourceLabel={sourceLabel}
                  recruitment={canReadRecruitment && location === 'All locations' && employmentType === 'All employment types' && Number(reportingDate.slice(-2)) === lastDayOfMonth && importedModel.completeness.recruitment.has(reportingMonth)
                    ? getPlanningReport(importedModel, 'recruitment', reportingMonth, reportingDate, filters).metrics : null} />
              : employeeMasterPage
              ? <EmployeeDirectory employees={employeeDirectoryRows} asOfDate={reportingDate} sourceLabel={sourceLabel} rosterComplete={Boolean(importedModel.employeeMasterAsOf)} />
              : planningPage
              ? <PlanningModules page={activeView} dataSource={dataSource} model={importedModel} selectedMonth={reportingMonth} selectedDate={reportingDate} filters={filters} canReadIncrements={canReadIncrements} sourceLabel={sourceLabel} />
              : activeView === 'reports'
              ? <ReportsCenter employees={employees} trends={trend} departments={departmentData} projectAssignments={projectAssignments} importedModel={importedModel} dataSource={dataSource} selectedMonth={reportingMonth} selectedDate={reportingDate} filters={filters} getPeriodMetrics={getPeriodMetrics} sourceLabel={sourceLabel} allowedReports={allowedReportKeys} authStatus={authStatus} incrementBandLimits={incrementBandLimits} liveLoadedAt={liveWorkspaceState.workspace?.loadedAt} liveUserId={liveWorkspaceState.workspace?.userId} liveScopeKey={liveWorkspaceState.workspace?.scopeKey} refreshLiveWorkspace={refreshLiveWorkspaceForExport} />
              : <DashboardModules page={activeView} employees={employees} trends={trend} departments={departmentData} workforceHeadcount={monthlyMetrics.headcount} selectedMonth={reportingMonth} selectedDate={reportingDate} filters={filters} getPeriodMetrics={getPeriodMetrics} financialYearStartMonth={financialYearStartMonth} sourceLabel={sourceLabel} isImported projectAssignments={projectAssignments} canReadEmployees={hasPermission(accessProfile, 'employee.read')} canReadPayroll={canReadPayroll} canReadLeave={canReadLeave} projectCostBasis={projectCostBasis} onProjectCostBasisChange={setProjectCostBasis} incrementBandLimits={incrementBandLimits} onIncrementBandLimitsChange={setIncrementBandLimits} />}
          </Suspense>
          </AppErrorBoundary>
          </>}
          <footer className="app-footer"><span>PeoplePulse <i>Â·</i> HR Analytics</span><span>{showExecutiveSample ? 'Fictional sample preview' : dataSource === 'imported' ? 'Imported source · no file upload to a server' : sourceLabel}</span></footer>
        </div>
      </main>
    </div>
  )
}

export default App
