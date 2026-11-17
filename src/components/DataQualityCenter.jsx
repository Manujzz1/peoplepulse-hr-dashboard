import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Database, FileWarning, Link2, ShieldCheck } from 'lucide-react'
import { EmptyChart, MetricCard, Panel } from './DashboardParts'
import { IMPORT_CATEGORIES, MONTHLY_IMPORT_CATEGORIES } from '../import/importSchemas'
import { getLatestPayrollReconciliationBatch, getPayrollControlMismatches } from '../import/payrollReconciliation'
import { getImportedAvailableMonths, getImportedDashboardReadiness, getImportedMonthMetrics } from '../data/hrModel'
import { financialYearRangeLabel } from '../data/reportingCalendar'

const formatDateTime = (value) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'No successful staging event'

export default function DataQualityCenter({ model, stagedImports, selectedMonth, selectedDate, filters, canReadIncrements = false, financialYearStartMonth = 4 }) {
  const months = useMemo(() => getImportedAvailableMonths(model), [model])
  const metrics = useMemo(() => getImportedMonthMetrics(model, selectedMonth, filters, selectedDate, { financialYearStartMonth }), [model, selectedMonth, selectedDate, filters, financialYearStartMonth])
  const readiness = useMemo(() => getImportedDashboardReadiness(model, selectedMonth, { financialYearStartMonth }), [model, selectedMonth, financialYearStartMonth])
  const financialYearLabel = financialYearRangeLabel(financialYearStartMonth)
  const stagedCategories = IMPORT_CATEGORIES.filter(({ id }) => stagedImports[id])
  const totalRows = stagedCategories.reduce((sum, { id }) => sum + stagedImports[id].rows.length, 0)
  const latestBatch = stagedCategories.reduce((latest, { id }) => {
    const stage = stagedImports[id]
    return !latest || stage.stagedAt > latest.stagedAt ? { ...stage, category: id } : latest
  }, null)
  const rejected = stagedCategories.reduce((sum, { id }) => sum + (stagedImports[id].summary?.rejectedRows || 0), 0)
  const warnings = stagedCategories.reduce((sum, { id }) => sum + (stagedImports[id].summary?.warningCount || 0), 0)
  const incompleteMonths = months.filter((month) => !stagedImports.payroll?.completeMonths?.includes(month))
  const payrollControlBatch = getLatestPayrollReconciliationBatch(stagedImports.payroll?.reconciliationBatches, selectedMonth)
  const unresolvedPayrollMismatches = getPayrollControlMismatches(stagedImports.payroll?.reconciliationBatches, selectedMonth)
  const reconciliationAmount = (value) => `INR ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)}`
  const payrollControlStatus = !payrollControlBatch
    ? 'Unavailable: no file control total was entered for this period'
    : payrollControlBatch.sourceControlTotal == null
      ? unresolvedPayrollMismatches.length
        ? `Latest file ${payrollControlBatch.fileName} had no control total; ${unresolvedPayrollMismatches.length} prior mismatch(es) remain unresolved`
        : `Unavailable: latest file ${payrollControlBatch.fileName} had no control total`
      : Math.abs(payrollControlBatch.difference) < 0.005
        ? 'Matched: difference INR 0'
        : `Difference ${payrollControlBatch.difference > 0 ? '+' : ''}${reconciliationAmount(payrollControlBatch.difference)}`
  const employeesWithoutCompany = [...model.employees.values()].filter((employee) => !employee.company).length
  const dayReconciliation = metrics.attendance.dayReconciliation
  const attendanceDayStatus = !dayReconciliation.available
    ? `Unavailable · day-level inputs are present for ${dayReconciliation.checkedRows} of ${dayReconciliation.rowCount} attendance rows`
    : dayReconciliation.mismatchRows
      ? `${dayReconciliation.reconciledRows} of ${dayReconciliation.rowCount} rows reconcile; ${dayReconciliation.mismatchRows} have day-total differences`
      : `All ${dayReconciliation.rowCount} rows reconcile`
  const qualityChecks = [
    { label: 'Employee references', value: metrics.dataQuality.unmatchedEmployeeReferences, detail: 'Staged records that do not resolve to Employee Master', icon: Link2, tone: metrics.dataQuality.unmatchedEmployeeReferences ? 'rose' : 'green' },
    { label: 'Employees without company', value: employeesWithoutCompany, detail: 'Assign Company in Employee Master to support company-level reporting', icon: AlertTriangle, tone: employeesWithoutCompany ? 'amber' : 'green' },
    { label: 'Employee history', value: model.completeness.employeeHistory ? 'Confirmed' : 'Not confirmed', detail: model.completeness.employeeHistory ? `${model.employeeHistory.length} effective-dated rows applied to workforce attributes` : 'Historical department, location, designation, grade, and employment changes are not confirmed', icon: Clock3, tone: model.completeness.employeeHistory ? 'green' : 'amber' },
    { label: 'Project references', value: metrics.dataQuality.unmatchedProjectReferences, detail: 'Allocations with unknown project codes', icon: Link2, tone: metrics.dataQuality.unmatchedProjectReferences ? 'rose' : 'green' },
    { label: 'Payroll coverage', value: metrics.payroll.missingEmployeeCount ?? 'Unavailable', detail: 'Active employees without payroll in the selected period', icon: FileWarning, tone: metrics.payroll.missingEmployeeCount > 0 ? 'rose' : 'blue' },
    { label: 'Attendance coverage', value: metrics.attendance.missingEmployeeCount, detail: 'Active employees without attendance in the selected period', icon: FileWarning, tone: metrics.attendance.missingEmployeeCount > 0 ? 'rose' : 'blue' },
    { label: 'FYTD leave utilisation', value: metrics.leave.utilisationPercentage == null ? 'Unavailable' : `${metrics.leave.utilisationPercentage.toFixed(1)}%`, detail: metrics.leave.complete ? `${financialYearLabel} Leave balances and employee coverage reconcile` : `${metrics.leave.periodsComplete ? 'FYTD months complete' : 'FYTD months incomplete'} · ${metrics.leave.availableDays} available days · ${metrics.leave.missingEmployeeCount} missing employees · ${metrics.leave.missingBalanceCount} missing balances · ${metrics.leave.balanceMismatchCount} balance mismatches`, icon: FileWarning, tone: metrics.leave.complete ? 'green' : 'amber' },
    ...(canReadIncrements ? [{ label: 'Approved increments', value: metrics.increments.complete ? metrics.increments.approvedCount : 'Incomplete', detail: `${metrics.increments.pendingCount} pending · ${metrics.increments.rejectedCount} rejected · selected-month source`, icon: FileWarning, tone: metrics.increments.complete ? 'green' : 'amber' }] : []),
    { label: 'Missing annual CTC', value: metrics.payroll.missingAnnualCtcCount, detail: 'Payroll rows where annual CTC was not supplied', icon: FileWarning, tone: metrics.payroll.missingAnnualCtcCount > 0 ? 'amber' : 'green' },
    { label: 'Overallocated employees', value: metrics.projects.overallocatedEmployees.length, detail: 'Allocation totals over 100% in selected month', icon: AlertTriangle, tone: metrics.projects.overallocatedEmployees.length ? 'rose' : 'green' },
  ]

  return <div className="data-quality-module">
    <div className="synthetic-banner imported-source-banner"><span className="banner-shield"><ShieldCheck size={14} /></span><span><b>In-memory source audit</b> — quality checks use staged rows only. No employee-level records are shown here or sent to a server.</span></div>
    <div className="metric-grid">
      <MetricCard label="Categories staged" value={`${stagedCategories.length} / ${IMPORT_CATEGORIES.length}`} detail="Import categories with staged data" tone="blue" icon={Database} />
      <MetricCard label="Valid rows staged" value={totalRows} detail="Current in-memory rows" tone="teal" icon={CheckCircle2} />
      <MetricCard label="Rejected rows" value={rejected} detail="Across latest validation batches" tone={rejected ? 'rose' : 'green'} icon={FileWarning} />
      <MetricCard label="Validation warnings" value={warnings} detail="Across latest validation batches" tone={warnings ? 'amber' : 'green'} icon={AlertTriangle} />
      <MetricCard label="Last successful staging" value={latestBatch ? formatDateTime(latestBatch.stagedAt) : 'None'} detail={latestBatch ? latestBatch.fileName : 'No import has been staged'} tone="violet" icon={Clock3} />
    </div>
    <Panel title={`Data checks · ${selectedMonth}`} subtitle="Coverage and reference checks use the selected month and shared department, location, and employment-type filters.">
      <div className="quality-check-grid">{qualityChecks.map(({ label, value, detail, icon: Icon, tone }) => <article className={`quality-check-card ${tone}`} key={label}><span className="quality-check-icon"><Icon size={16} /></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>)}</div>
    </Panel>
    <Panel title="Source completeness" subtitle="A source is complete only when explicitly confirmed during staging and all required checks pass.">
      {stagedCategories.length ? <div className="report-table-scroll"><table><thead><tr><th>Dataset</th><th>Rows</th><th>Selected period status</th><th>Last staged</th></tr></thead><tbody>{IMPORT_CATEGORIES.map(({ id, label }) => {
        const stage = stagedImports[id]
        const payrollMismatch = id === 'payroll' && getPayrollControlMismatches(stage?.reconciliationBatches, selectedMonth).length > 0
        const complete = stage && !payrollMismatch && (MONTHLY_IMPORT_CATEGORIES.includes(id) ? stage.completeMonths.includes(selectedMonth) : id === 'employeeMaster' ? Boolean(stage.completeAsOf && stage.completeAsOf >= selectedDate) : Boolean(stage.complete))
        const status = !stage ? 'Not staged' : payrollMismatch ? 'Payroll control-total mismatch' : complete ? 'Confirmed complete' : 'Staged; incomplete or unconfirmed'
        return <tr key={id}><td>{label}</td><td>{stage?.rows.length ?? '—'}</td><td><span className={`validation-pill ${complete ? 'valid' : stage ? 'warning' : 'error'}`}>{status}</span></td><td>{stage ? formatDateTime(stage.stagedAt) : '—'}</td></tr>
      })}</tbody></table></div> : <EmptyChart message="No imports are staged. Use Data Import to load a synthetic test template or a local file." />}
    </Panel>
    <div className="chart-grid">
      <Panel title={`Dashboard readiness · ${selectedMonth}`} subtitle={readiness.ready ? 'The imported analytics readiness checks pass for this period.' : 'Imported dashboards remain unavailable until required data checks pass.'}>
        <div className={`quality-readiness ${readiness.ready ? 'ready' : 'not-ready'}`}><strong>{readiness.ready ? 'Ready for this reporting period' : `${readiness.reasons.length} readiness issue${readiness.reasons.length === 1 ? '' : 's'}`}</strong>{!readiness.ready && <ul>{readiness.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}</div>
      </Panel>
      <Panel title="Reconciliation checks" subtitle="Source control totals and employee-level attendance day inputs are checked when supplied.">
        <ul className="quality-limit-list"><li><span>Payroll control-total difference</span><b>{payrollControlStatus}</b></li><li><span>Attendance day reconciliation</span><b>{attendanceDayStatus}</b></li><li><span>Payroll months without completeness confirmation</span><b>{incompleteMonths.length}{incompleteMonths.length ? ` (${incompleteMonths.join(', ')})` : ''}</b></li></ul>
      </Panel>
    </div>
    <p className="planning-definition">Rejected-row and warning totals summarize the most recent validation batch for each staged category. Detailed row-level issues are not retained after staging; re-open and validate the source file to inspect them. Missing IDs, duplicate keys, invalid project codes, and allocation overages are rejected during import validation.</p>
  </div>
}
