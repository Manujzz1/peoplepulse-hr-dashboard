import { useState } from 'react'
import {
  Activity, ArrowDown, ArrowUpRight, BriefcaseBusiness, CalendarDays, Check, Download, FileSpreadsheet,
  Search, Sparkles, UsersRound, Wallet,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend,
  Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { ChartTooltip, EmptyChart, MetricCard, Panel } from './DashboardParts'
import { KPI_CATALOG, PAYROLL_COMPONENTS } from '../data/hrModel'
import { DEFAULT_INCREMENT_BAND_LIMITS, getIncrementDistribution, normalizeIncrementBandLimits } from '../data/incrementPolicy'
import { getExecutivePeriodComparisons } from '../data/periodComparisons'
import { financialYearRangeLabel } from '../data/reportingCalendar'
import { serializeCsv } from '../data/csv'
import chartColors from '../chartColors'
import {
  DEMO_ANNUAL_LEAVE_ENTITLEMENT_DAYS, formatINR, getGroupData, getMonthMetrics, getPreviousDateValue, getPreviousMonthValue,
} from '../data/demoData'
function DownloadButton({ onClick }) {
  return <button className="export-button" onClick={onClick}><Download size={15} /> Export CSV</button>
}

function EmployeeTable({ employees, title = 'Employee directory', description = 'Filtered synthetic employee records', columns, sourceLabel = 'Synthetic demo data' }) {
  const [query, setQuery] = useState('')
  const tableColumns = columns || [
    { key: 'name', label: 'Employee' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' },
    { key: 'employmentType', label: 'Employment type' },
    { key: 'monthlySalary', label: 'Monthly gross', format: (value) => formatINR(value) },
    { key: 'performanceScore', label: 'PMS score', format: (value) => `${value} / 5` },
  ]
  const filtered = employees.filter((employee) =>
    tableColumns.some(({ key }) => String(employee[key] ?? '').toLowerCase().includes(query.toLowerCase())),
  )

  const exportCsv = () => {
    const rows = filtered.map((employee) => tableColumns.map(({ key, format }) =>
      employee[key] != null && format ? format(employee[key]) : employee[key]))
    const csv = serializeCsv(tableColumns.map((column) => column.label), rows, sourceLabel)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `peoplepulse-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <Panel title={title} subtitle={description} className="table-panel" action={<DownloadButton onClick={exportCsv} />}>
      <div className="table-toolbar">
        <div className="table-count"><FileSpreadsheet size={15} /><span><b>{filtered.length}</b> records</span></div>
        <label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employees..." aria-label="Search employees" /></label>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr>{tableColumns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>
            {filtered.map((employee) => (
              <tr key={employee.employeeRecordId || employee.id}>
                {tableColumns.map(({ key, format }) => (
                  <td key={key}>
                    {key === 'name'
                      ? <div className="employee-name"><span className="employee-avatar">{employee.name.split(' ').at(-1).slice(-2)}</span><span>{employee.name}<small>{employee.id}</small></span></div>
                      : key === 'department'
                        ? <span className="department-cell"><i />{employee[key]}</span>
                        : key === 'performanceScore'
                          ? <span className="score-pill">{employee[key] == null ? 'Unavailable' : format ? format(employee[key]) : employee[key]}</span>
                          : employee[key] == null ? 'Unavailable' : format ? format(employee[key]) : employee[key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyChart message={query ? 'No employees match your search' : 'No employee data for these filters'} />}
      </div>
      <div className="table-footnote">{sourceLabel}</div>
    </Panel>
  )
}

function ChartPanel({ title, subtitle, children, className = '', action }) {
  return <Panel title={title} subtitle={subtitle} className={`chart-panel ${className}`} action={action}>{children}</Panel>
}

function trendPeriodLabel(trends) {
  const periods = trends.map((item) => item.reportingMonth).filter(Boolean)
  return periods.length ? `${periods[0]} to ${periods.at(-1)}` : '2025'
}

function WorkforceTable({ data, dataKey = 'headcount', valueFormat }) {
  return (
    <div className="rank-list">
      {data.map((item, index) => {
        const value = item[dataKey]
        const max = Math.max(...data.map((row) => row[dataKey]), 1)
        return (
          <div className="rank-row" key={item.department || item.location || item.project || item.employmentType || item.gender || item.tenure || item.band || item.score || index}>
            <div className="rank-label"><span className="rank-index">{String(index + 1).padStart(2, '0')}</span><span>{item.department || item.location || item.project || item.employmentType || item.gender || item.tenure || item.band || item.score || item.component}</span></div>
            <div className="rank-track"><i style={{ width: `${Math.max((value / max) * 100, 4)}%`, background: chartColors[index % chartColors.length] }} /></div>
            <b>{valueFormat ? valueFormat(value) : value}</b>
          </div>
        )
      })}
    </div>
  )
}

function ExecutiveView({ employees, trends, departments, selectedMonth, selectedDate, filters, getPeriodMetrics = getMonthMetrics, sourceLabel, canReadEmployees = true, financialYearStartMonth = 4 }) {
  const periodLabel = new Date(`${selectedMonth}-01T00:00:00`).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  const current = getPeriodMetrics(selectedMonth, filters, selectedDate)
  const previous = getPeriodMetrics(getPreviousMonthValue(selectedMonth), filters, getPreviousDateValue(selectedDate))
  const active = current.active
  const attendance = Object.hasOwn(current, 'attendanceAveragePercentage')
    ? current.attendanceAveragePercentage
    : active.length ? active.reduce((sum, employee) => sum + employee.attendance, 0) / active.length : null
  const openingHeadcount = current.openingHeadcount ?? previous.headcount
  const averageHeadcount = (openingHeadcount + current.headcount) / 2
  const attrition = averageHeadcount ? current.exits.length / averageHeadcount * 100 : 0
  const permanentHeadcount = active.filter((employee) => employee.employmentType === 'Permanent').length
  const contractHeadcount = active.filter((employee) => employee.employmentType === 'Contract').length
  const headcountChange = previous.headcount && previous.headcountComplete !== false ? ((current.headcount - previous.headcount) / previous.headcount) * 100 : null
  const payrollChange = previous.payroll && previous.payrollComplete !== false ? ((current.payroll - previous.payroll) / previous.payroll) * 100 : null
  const periodComparisons = getExecutivePeriodComparisons(trends, selectedMonth, financialYearStartMonth)
  const financialYearLabel = financialYearRangeLabel(financialYearStartMonth)
  const yearOnYearPayrollChange = periodComparisons.find((comparison) => comparison.label === 'Selected month vs same month prior year')?.payrollChange
  const employment = getGroupData(active, 'employmentType', 'employmentType')
  const employmentColors = { Permanent: '#4869f5', Contract: '#9aa9ff' }

  return (
    <>
      <div className="metric-grid">
        <MetricCard label="Total headcount" value={current.headcount} detail="vs. previous month" change={headcountChange == null ? undefined : Math.round(headcountChange * 10) / 10} tone="blue" icon={UsersRound} />
        <MetricCard label="Monthly gross payroll" value={current.payroll} formatValue={(value) => formatINR(value, true)} detail="vs. previous month" change={payrollChange == null ? undefined : Math.round(payrollChange * 10) / 10} tone="violet" icon={Wallet} />
        <MetricCard label="Joiners" value={current.joiners.length} detail={`${periodLabel} additions`} tone="green" icon={ArrowUpRight} />
        <MetricCard label="Exits" value={current.exits.length} detail={`${periodLabel} exits`} tone="rose" icon={ArrowDown} />
        <MetricCard label="Attrition rate" value={`${attrition.toFixed(1)}%`} detail="Exits / average period headcount" tone="amber" icon={Activity} />
        <MetricCard label="Attendance" value={attendance == null ? 'Unavailable' : `${attendance.toFixed(1)}%`} detail="average reported attendance" tone="teal" icon={Check} />
      </div>
      <div className="metric-grid executive-detail-metrics">
        <MetricCard label="Opening headcount" value={openingHeadcount} detail="Active at prior period end" tone="blue" icon={UsersRound} />
        <MetricCard label="Average headcount" value={Math.round(averageHeadcount * 10) / 10} detail="Opening + closing ÷ 2" tone="violet" icon={Activity} />
        <MetricCard label="Permanent" value={permanentHeadcount} detail="Current active workforce" tone="teal" icon={UsersRound} />
        <MetricCard label="Contract" value={contractHeadcount} detail="Current active workforce" tone="amber" icon={BriefcaseBusiness} />
        <MetricCard label="Payroll YoY variance" value={yearOnYearPayrollChange == null ? 'Unavailable' : `${yearOnYearPayrollChange > 0 ? '+' : ''}${yearOnYearPayrollChange.toFixed(1)}%`} detail="Monthly gross vs same month prior year" tone="violet" icon={Wallet} />
        {current.recruitmentAvailable && <MetricCard label="Open vacancies" value={current.recruitmentComplete ? current.recruitmentOpenPositions : 'Provisional'} detail={current.recruitmentComplete ? 'Approved positions not yet filled' : `${current.recruitmentOpenPositions ?? 0} reported · recruitment month is incomplete`} tone="amber" icon={BriefcaseBusiness} />}
        <MetricCard label="Net movement" value={current.joiners.length - current.exits.length} detail={`${current.joiners.length} joiners − ${current.exits.length} exits`} tone="green" icon={ArrowUpRight} />
      </div>
      <details className="kpi-definitions">
        <summary><span>KPI definitions</span><small>Calculation rules for the workforce movement metrics</small></summary>
        <div className="kpi-definition-list">{Object.entries(KPI_CATALOG).map(([key, item]) => <div key={key}><strong>{item.name}</strong><p>{item.description}</p><p><b>Formula:</b> {item.formula}</p><p><b>Fields:</b> {item.fields}</p><p><b>Period and filters:</b> {item.period}; {item.filters}</p><p><b>Completeness:</b> {item.completeness}</p><p><b>Unit / rounding:</b> {item.unit}; {item.rounding}</p><p><b>Example:</b> {item.example}</p></div>)}</div>
      </details>
      <Panel title="Period comparisons" subtitle={`Quarter-to-date and ${financialYearLabel} reporting-year-to-date compare with matching elapsed periods. Values are shown only when the required history is available.`} className="period-comparison-panel">
        <div className="period-comparison-scroll"><table><thead><tr><th>Comparison</th><th>Current period</th><th>Previous period</th><th>Closing headcount change</th><th>Gross payroll change</th></tr></thead><tbody>{periodComparisons.map((comparison) => <tr key={comparison.label}><td>{comparison.label}</td><td>{comparison.currentPeriod}</td><td>{comparison.previousPeriod}</td><td>{comparison.headcountChange == null ? 'Unavailable' : `${comparison.headcountChange > 0 ? '+' : ''}${comparison.headcountChange.toFixed(1)}%`}</td><td>{comparison.payrollChange == null ? 'Unavailable' : `${comparison.payrollChange > 0 ? '+' : ''}${comparison.payrollChange.toFixed(1)}%`}</td></tr>)}</tbody></table></div>
      </Panel>
      <div className="chart-grid executive-grid">
        <ChartPanel title="Headcount trend" subtitle={`Month-end active employees Â· ${trendPeriodLabel(trends)}`} className="wide-panel" action={<span className="panel-tag"><i /> Headcount</span>}>
          {employees.length ? <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trends} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <defs><linearGradient id="headcountFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4969f5" stopOpacity={0.19} /><stop offset="100%" stopColor="#4969f5" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="#eef0f5" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 11 }} dy={9} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="headcount" name="Headcount" stroke="#4869f5" strokeWidth={2.5} fill="url(#headcountFill)" activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff' }} />
            </AreaChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
        <ChartPanel title="Employment type" subtitle="Current workforce mix">
          {employment.length ? <>
            <div className="donut-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={employment} dataKey="headcount" nameKey="employmentType" innerRadius="67%" outerRadius="88%" paddingAngle={4} stroke="none">
                  {employment.map((item) => <Cell key={item.employmentType} fill={employmentColors[item.employmentType] || '#4869f5'} />)}
                </Pie><Tooltip content={<ChartTooltip />} /></PieChart>
              </ResponsiveContainer>
              <div className="donut-center"><strong>{active.length}</strong><span>Employees</span></div>
            </div>
            <div className="donut-legend">{employment.map((item) => <div key={item.employmentType}><span><i style={{ background: employmentColors[item.employmentType] }} />{item.employmentType}</span><b>{item.headcount}<small> Â· {Math.round(item.headcount / Math.max(active.length, 1) * 100)}%</small></b></div>)}</div>
          </> : <EmptyChart />}
        </ChartPanel>
        <ChartPanel title="Monthly gross payroll" subtitle="Month-end gross salary Â· INR">
          {employees.length ? <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trends} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs><linearGradient id="payrollFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#47b49d" stopOpacity={0.2} /><stop offset="100%" stopColor="#47b49d" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="#eef0f5" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 11 }} dy={9} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} tickFormatter={(value) => `${Math.round(value / 100000)}L`} width={35} />
              <Tooltip content={<ChartTooltip currency formatINR={formatINR} />} />
              <Area type="monotone" dataKey="payroll" name="Gross payroll" stroke="#55b6a5" strokeWidth={2.5} fill="url(#payrollFill)" activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff' }} />
            </AreaChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
        <ChartPanel title="Headcount by department" subtitle="Active employees across teams">
          {departments.length ? <ResponsiveContainer width="100%" height="100%">
            <BarChart data={departments} layout="vertical" margin={{ top: 0, right: 18, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f5" horizontal={false} />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} />
              <YAxis type="category" dataKey="department" width={84} axisLine={false} tickLine={false} tick={{ fill: '#6f7787', fontSize: 10 }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="headcount" name="Employees" fill="#667ff4" radius={[0, 5, 5, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
        <ChartPanel title="Monthly people movement" subtitle={`Joiners and exits · ${trendPeriodLabel(trends)}`}>
          {employees.length ? <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trends} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f5" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 11 }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} />
              <Tooltip content={<ChartTooltip />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
              <Bar dataKey="joiners" name="Joiners" fill="#55b6a5" radius={[3, 3, 0, 0]} barSize={14} />
              <Bar dataKey="exits" name="Exits" fill="#e5798c" radius={[3, 3, 0, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
        <ChartPanel title="Monthly attrition rate" subtitle="Exits ÷ average opening and closing headcount">
          {employees.length ? <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trends} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f5" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 11 }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} unit="%" />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="attrition" name="Attrition" stroke="#e5798c" strokeWidth={2.5} connectNulls={false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
      </div>
      {canReadEmployees && <EmployeeTable employees={employees} sourceLabel={sourceLabel} />}
    </>
  )
}

function WorkforceView({ employees, trends, departments, sourceLabel, isImported = false, workforceHeadcount, canReadEmployees = true }) {
  const locations = getGroupData(employees, 'location', 'location')
  const employment = getGroupData(employees, 'employmentType', 'employmentType')
  const gender = getGroupData(employees, 'gender', 'gender')
  const { exitTypeDistribution = [], averageTenureAtExitYears } = workforceHeadcount ?? {}
  const hasWorkforceTrend = trends.some(({ headcount, attrition }) => Number.isFinite(headcount) || Number.isFinite(attrition))
  const hasMovementTrend = trends.some(({ joiners, exits }) => Number.isFinite(joiners) || Number.isFinite(exits))
  const tenureGroups = [
    { tenure: '< 1 year', headcount: employees.filter((employee) => employee.tenureYears < 1).length },
    { tenure: '1â€“3 years', headcount: employees.filter((employee) => employee.tenureYears >= 1 && employee.tenureYears < 3).length },
    { tenure: '3â€“5 years', headcount: employees.filter((employee) => employee.tenureYears >= 3 && employee.tenureYears < 5).length },
    { tenure: '5+ years', headcount: employees.filter((employee) => employee.tenureYears >= 5).length },
  ]
  return (
    <>
      <div className="chart-grid">
        <ChartPanel title="Department distribution" subtitle="People by department">
          <WorkforceTable data={departments} />
        </ChartPanel>
        <ChartPanel title="Workforce by location" subtitle="Active employees by office">
          <WorkforceTable data={locations} />
        </ChartPanel>
        <ChartPanel title="Employee type" subtitle="Permanent vs. contract">
          <div className="large-breakdown">
            {employment.map((item, index) => <div className="breakdown-card" key={item.employmentType}><span className="breakdown-icon" style={{ background: `${chartColors[index]}18`, color: chartColors[index] }}><UsersRound size={17} /></span><span><small>{item.employmentType}</small><strong>{item.headcount}</strong></span><i>{employees.length ? Math.round(item.headcount / employees.length * 100) : 0}%</i></div>)}
          </div>
        </ChartPanel>
        <ChartPanel title="Gender distribution" subtitle={isImported ? 'Imported Employee Master Â· missing values grouped as Not specified' : 'Self-reported synthetic sample'}>
          <WorkforceTable data={gender} />
        </ChartPanel>
        <ChartPanel title="Tenure distribution" subtitle="Years of service as of selected month" className="wide-panel">
          {employees.length ? <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tenureGroups} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f5" vertical={false} /><XAxis dataKey="tenure" axisLine={false} tickLine={false} tick={{ fill: '#7d8492', fontSize: 11 }} dy={8} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} />
              <Tooltip content={<ChartTooltip />} /><Bar dataKey="headcount" name="Employees" fill="#6c83f5" radius={[5, 5, 0, 0]} barSize={38} />
            </BarChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
        <ChartPanel title="Headcount and attrition trend" subtitle={trendPeriodLabel(trends)}>
          {hasWorkforceTrend ? <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trends} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f5" vertical={false} /><XAxis dataKey="month" /><YAxis yAxisId="count" allowDecimals={false} /><YAxis yAxisId="rate" orientation="right" tickFormatter={(value) => `${value}%`} />
              <Tooltip content={<ChartTooltip />} /><Legend />
              <Line yAxisId="count" dataKey="headcount" name="Headcount" stroke="#627cf5" /><Line yAxisId="rate" dataKey="attrition" name="Attrition (%)" stroke="#e5798c" />
            </LineChart>
          </ResponsiveContainer> : <EmptyChart message="No verified headcount or attrition history for these filters." />}
        </ChartPanel>
        <ChartPanel title="Monthly workforce comparison" subtitle={`Joiners and exits Â· ${trendPeriodLabel(trends)}`} className="wide-panel">
          {hasMovementTrend ? <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trends} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f5" vertical={false} /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 11 }} dy={8} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} />
              <Tooltip content={<ChartTooltip />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
              <Bar dataKey="joiners" name="Joiners" fill="#55b6a5" radius={[3, 3, 0, 0]} barSize={14} /><Bar dataKey="exits" name="Exits" fill="#e5798c" radius={[3, 3, 0, 0]} barSize={14} />
            </ComposedChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
        {isImported && <ChartPanel title="Exit profile" subtitle={!Number.isFinite(averageTenureAtExitYears) ? 'Average tenure at exit unavailable' : `Average tenure at exit Â· ${averageTenureAtExitYears.toFixed(1)} years`}>
          {exitTypeDistribution?.length
            ? <WorkforceTable data={exitTypeDistribution.map(({ exitType, count }) => ({ department: exitType, headcount: count }))} />
            : <EmptyChart message="No confirmed exits in this reporting period." />}
        </ChartPanel>}
      </div>
      {canReadEmployees && <EmployeeTable employees={employees} title="Workforce directory" description="Employees matching the current filters" sourceLabel={sourceLabel} />}
    </>
  )
}

function PayrollView({ employees, trends, departments, selectedMonth, selectedDate, filters, getPeriodMetrics = getMonthMetrics, isImported = false, sourceLabel }) {
  const selected = getPeriodMetrics(selectedMonth, filters, selectedDate)
  const totalGross = isImported ? selected.payroll : employees.reduce((sum, employee) => sum + employee.monthlySalary, 0)
  const annualCtc = isImported ? selected.payrollAnnualCtc : employees.reduce((sum, employee) => sum + employee.annualCtc, 0)
  const annualCtcUnavailable = isImported && (selected.missingAnnualCtcCount > 0 || employees.some((employee) => employee.annualCtc == null))
  const incrementCost = isImported ? selected.incrementMonthlyCostImpact : employees.reduce((sum, employee) => sum + (employee.monthlySalary - employee.monthlyBase), 0)
  const previous = getPeriodMetrics(getPreviousMonthValue(selectedMonth), filters, getPreviousDateValue(selectedDate))
  const variance = previous.payroll > 0 && previous.payrollComplete !== false && selected.payrollComplete !== false && Number.isFinite(selected.payroll) ? ((selected.payroll - previous.payroll) / previous.payroll) * 100 : null
  const employeesWithIncrement = employees.filter((employee) => employee.incrementPercent != null)
  const incrementAverage = isImported ? selected.incrementAveragePercent : employeesWithIncrement.length ? employeesWithIncrement.reduce((sum, employee) => sum + employee.incrementPercent, 0) / employeesWithIncrement.length : null
  const trend = trends.map((item, index) => {
    const prior = trends[index - 1]
    const adjacent = !item.reportingMonth || prior?.reportingMonth === getPreviousMonthValue(item.reportingMonth)
    const variance = adjacent && item.payroll != null && prior?.payroll > 0
      ? Math.round(((item.payroll - prior.payroll) / prior.payroll) * 1000) / 10 : null
    return { ...item, variance }
  })
  return (
    <>
      <div className="metric-grid four-metrics">
        <MetricCard label="Monthly gross salary" value={totalGross} formatValue={(value) => formatINR(value, true)} detail={isImported ? 'Reported payroll records · selected month' : 'Active workforce · selected month'} tone="blue" icon={Wallet} />
        <MetricCard label="Annual CTC" value={annualCtcUnavailable ? 'Not provided' : annualCtc} formatValue={annualCtcUnavailable ? undefined : (value) => formatINR(value, true)} detail={isImported ? 'Reported Annual CTC Â· no salary substitution' : 'Gross salary + 15% benefits'} tone="violet" icon={BriefcaseBusiness} />
        <MetricCard label="Increment cost impact" value={isImported && !selected.incrementAccess ? 'Restricted' : isImported && incrementCost == null ? 'Not provided' : incrementCost} formatValue={incrementCost == null ? undefined : (value) => formatINR(value, true)} detail={isImported ? !selected.incrementAccess ? 'Requires increments.read permission' : selected.incrementComplete ? 'Approved annual CTC increases converted to monthly run-rate' : 'Increment source is incomplete for this month' : 'Monthly cost from synthetic increments'} tone="green" icon={ArrowUpRight} />
        <MetricCard label="Average increment" value={isImported && !selected.incrementAccess ? 'Restricted' : incrementAverage == null ? 'Not provided' : `${incrementAverage.toFixed(1)}%`} detail={isImported ? !selected.incrementAccess ? 'Requires increments.read permission' : `${selected.incrementApprovedCount || 0} approved changes effective this month` : variance == null ? 'Payroll MoM unavailable' : `Payroll MoM ${variance >= 0 ? '+' : ''}${variance.toFixed(1)}%`} tone="amber" icon={Activity} />
      </div>
      <div className="chart-grid">
        <ChartPanel title="Department-wise payroll" subtitle="Monthly gross salary Â· INR" className="wide-panel">
          {employees.length ? <ResponsiveContainer width="100%" height="100%">
            <BarChart data={isImported ? selected.payrollDepartmentData : departments} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f5" vertical={false} /><XAxis dataKey="department" axisLine={false} tickLine={false} tick={{ fill: '#7d8492', fontSize: 10 }} dy={8} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} tickFormatter={(value) => `${Math.round(value / 100000)}L`} width={42} />
              <Tooltip content={<ChartTooltip currency formatINR={formatINR} />} /><Bar dataKey="payroll" name="Gross payroll" fill="#627cf5" radius={[5, 5, 0, 0]} barSize={28} />
            </BarChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
        <ChartPanel title="Reported payroll components" subtitle="Reported component amounts are displayed separately and are not added to gross salary or CTC">
          {isImported && selected.payrollComponentTotals?.some((row) => row.complete)
            ? <WorkforceTable data={selected.payrollComponentTotals.filter((row) => row.complete)} dataKey="amount" valueFormat={(value) => formatINR(value, true)} />
            : <EmptyChart message={isImported ? 'Complete payroll component coverage is not available for this period and filter selection.' : 'Synthetic demo payroll does not include a component breakdown.'} />}
        </ChartPanel>
        <ChartPanel title="Payroll month-on-month variance" subtitle="Gross payroll change percentage">
          {employees.length ? <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f5" vertical={false} /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} dy={8} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} unit="%" />
              <Tooltip content={<ChartTooltip />} /><Line type="monotone" dataKey="variance" name="MoM variance" stroke="#55b6a5" strokeWidth={2.5} dot={{ r: 3, fill: '#55b6a5' }} />
            </LineChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
        <ChartPanel title="Employee cost trends" subtitle={`Monthly gross payroll Â· ${trendPeriodLabel(trends)} Â· INR`} className="wide-panel">
          {employees.length ? <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trends} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs><linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b7cf6" stopOpacity={0.2} /><stop offset="100%" stopColor="#8b7cf6" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="#eef0f5" vertical={false} /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 11 }} dy={8} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} tickFormatter={(value) => `${Math.round(value / 100000)}L`} width={40} /><Tooltip content={<ChartTooltip currency formatINR={formatINR} />} />
              <Area type="monotone" dataKey="payroll" name="Gross payroll" stroke="#8b7cf6" strokeWidth={2.5} fill="url(#costFill)" />
            </AreaChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
        <ChartPanel title="Increment cost impact" subtitle="Approved annual CTC increases converted to monthly run-rate by department">
          {isImported ? !selected.incrementAccess ? <EmptyChart message="Increment analytics require increments.read permission." /> : selected.incrementComplete && selected.incrementDepartmentData.length ? <WorkforceTable data={selected.incrementDepartmentData} dataKey="monthlyCostImpact" valueFormat={(value) => formatINR(value, true)} /> : <EmptyChart message="A complete Increment source is required for this month." /> : <WorkforceTable data={departments} dataKey="incrementCost" valueFormat={(value) => formatINR(value, true)} />}
        </ChartPanel>
      </div>
      <EmployeeTable employees={employees} title="Compensation directory" description="Monthly salary, annual CTC, and supplied payroll components" sourceLabel={sourceLabel} columns={[
        { key: 'name', label: 'Employee' }, { key: 'department', label: 'Department' }, { key: 'monthlySalary', label: 'Monthly gross', format: (value) => formatINR(value) }, { key: 'annualCtc', label: 'Annual CTC', format: (value) => value == null ? 'Not provided' : formatINR(value) },
        ...(isImported ? (selected.payrollComponentFields || []).map((key) => ({ key, label: `${PAYROLL_COMPONENTS.find((item) => item.key === key)?.label || key} (reported)`, format: (value) => value == null ? 'Not provided' : formatINR(value) })) : []),
      ]} />
    </>
  )
}

function AttendanceView({ employees, trends, departments, selectedMonth, selectedDate, filters, getPeriodMetrics = getMonthMetrics, sourceLabel, isImported = false, canReadLeave = true, financialYearStartMonth = 4 }) {
  const selected = getPeriodMetrics(selectedMonth, filters, selectedDate)
  const attendanceDepartments = isImported ? selected.attendanceDepartmentData : departments
  const hasAttendanceTrend = isImported ? trends.some((item) => item.attendance != null) : employees.length > 0
  const averageAttendance = isImported ? selected.attendanceAveragePercentage : employees.length ? employees.reduce((sum, employee) => sum + employee.attendance, 0) / employees.length : null
  const nonPresence = averageAttendance == null ? null : 100 - averageAttendance
  const lopDays = isImported ? selected.attendanceLopDays : employees.reduce((sum, employee) => sum + employee.lopDays, 0)
  const leaveAccess = isImported ? selected.leaveAccess ?? canReadLeave : canReadLeave
  const financialYearLabel = financialYearRangeLabel(financialYearStartMonth)
  const leaveUtilisation = isImported
    ? leaveAccess ? selected.leaveUtilisationPercentage : null
    : employees.length ? employees.reduce((sum, employee) => sum + employee.leaveTakenYtd, 0) / (employees.length * DEMO_ANNUAL_LEAVE_ENTITLEMENT_DAYS) * 100 : null
  const leaveUnavailableReason = !leaveAccess
    ? 'Leave analytics require leave.read permission.'
    : selected.leaveMissingBalanceCount
    ? 'Leave opening balances or monthly credits are missing.'
    : selected.leaveBalanceMismatchCount
      ? 'Leave balance totals do not reconcile.'
      : selected.leaveMissingEmployeeCount
        ? 'Active employees are missing leave records.'
        : !selected.leaveAvailableDays
          ? 'No available leave balance was supplied for this reporting period.'
        : `Complete ${financialYearLabel} Leave records are required.`
  return (
    <>
      <div className="metric-grid four-metrics">
        <MetricCard label="Attendance percentage" value={averageAttendance == null ? 'Unavailable' : `${averageAttendance.toFixed(1)}%`} detail="Average reported attendance" tone="teal" icon={Check} />
        <MetricCard label="Non-presence rate" value={nonPresence == null ? 'Unavailable' : `${nonPresence.toFixed(1)}%`} detail="Includes time away that may be approved leave" tone="amber" icon={Activity} />
        <MetricCard label="LOP days" value={lopDays} detail={isImported ? 'Reported attendance rows for selected month' : 'Synthetic sample for selected month'} tone="rose" icon={CalendarDays} />
        <MetricCard label="Leave utilisation" value={!leaveAccess ? 'Restricted' : leaveUtilisation == null ? 'Not provided' : `${leaveUtilisation.toFixed(1)}%`} detail={!leaveAccess ? leaveUnavailableReason : isImported ? leaveUtilisation == null ? leaveUnavailableReason : `${financialYearLabel} FYTD · Leave records · days availed / leave available` : `${financialYearLabel} FYTD · synthetic allowance of ${DEMO_ANNUAL_LEAVE_ENTITLEMENT_DAYS} days per employee`} tone="violet" icon={CalendarDays} />
      </div>
      <div className="chart-grid">
        <ChartPanel title="Monthly attendance trend" subtitle={`Average attendance percentage Â· ${trendPeriodLabel(trends)}`} className="wide-panel">
          {hasAttendanceTrend ? <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trends} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f5" vertical={false} /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 11 }} dy={8} /><YAxis domain={[85, 100]} axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} unit="%" /><Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="attendance" name="Attendance" stroke="#55b6a5" strokeWidth={2.5} dot={{ r: 3, fill: '#55b6a5' }} />
            </LineChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
        <ChartPanel title="Attendance by department" subtitle="Average reported attendance">
          {attendanceDepartments.length ? <ResponsiveContainer width="100%" height="100%">
            <BarChart data={attendanceDepartments} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f5" horizontal={false} /><XAxis type="number" domain={[85, 100]} axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} tickFormatter={(value) => `${value}%`} /><YAxis type="category" dataKey="department" width={82} axisLine={false} tickLine={false} tick={{ fill: '#6f7787', fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="attendance" name="Attendance" fill="#55b6a5" radius={[0, 5, 5, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
        <ChartPanel title="Leave utilisation by department" subtitle={isImported ? `${financialYearLabel} FYTD days availed as a share of available leave` : `${financialYearLabel} FYTD leave used as a share of synthetic sample allowance`} className="wide-panel">
          {!leaveAccess ? <EmptyChart message={leaveUnavailableReason} /> : isImported ? leaveUtilisation == null ? <EmptyChart message={leaveUnavailableReason} /> : <WorkforceTable data={selected.leaveDepartmentData} dataKey="utilisation" valueFormat={(value) => `${value}%`} /> : <WorkforceTable data={departments.map((item) => {
            const members = employees.filter((employee) => employee.department === item.department)
            const utilisation = members.length ? members.reduce((sum, employee) => sum + employee.leaveTakenYtd, 0) / (members.length * DEMO_ANNUAL_LEAVE_ENTITLEMENT_DAYS) * 100 : 0
            return { ...item, utilisation: Math.round(utilisation * 10) / 10 }
          })} dataKey="utilisation" valueFormat={(value) => `${value}%`} />}
        </ChartPanel>
      </div>
      <EmployeeTable employees={employees} title="Attendance overview" description={leaveAccess ? 'Attendance and leave details' : 'Attendance details'} sourceLabel={sourceLabel} columns={[
        { key: 'name', label: 'Employee' }, { key: 'department', label: 'Department' }, { key: 'attendance', label: 'Attendance', format: (value) => `${value}%` }, { key: 'lopDays', label: 'LOP days' }, ...(leaveAccess ? [{ key: 'leaveTakenYtd', label: 'FYTD leave taken' }] : []),
      ]} />
    </>
  )
}

function IncrementBandSettings({ limits, onChange }) {
  const [draft, setDraft] = useState(limits)
  const [error, setError] = useState('')
  const apply = (event) => {
    event.preventDefault()
    const normalized = normalizeIncrementBandLimits(draft)
    if (!normalized) {
      setError('Enter three increasing cutoffs between 0 and 100.')
      return
    }
    onChange(normalized)
    setError('')
  }
  return (
    <details className="increment-band-settings">
      <summary>Configure increment bands</summary>
      <form onSubmit={apply}>
        <span>Percentage cutoffs</span>
        {draft.map((value, index) => <label key={index}>Cutoff {index + 1}<input aria-label={`Increment band cutoff ${index + 1}`} type="number" min="0.01" max="99.99" step="0.1" value={value} onChange={(event) => setDraft((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></label>)}
        <button type="submit" className="filter-reset">Apply bands</button>
        {error && <span role="alert">{error}</span>}
        <small>Applies to increment distribution and report labels for this session.</small>
      </form>
    </details>
  )
}

function PerformanceView({ employees, departments, selectedMonth, selectedDate, filters, getPeriodMetrics = getMonthMetrics, isImported = false, sourceLabel, incrementBandLimits = DEFAULT_INCREMENT_BAND_LIMITS, onIncrementBandLimitsChange = () => {} }) {
  const selected = getPeriodMetrics(selectedMonth, filters, selectedDate)
  const scoredEmployees = employees.filter((employee) => employee.performanceScore != null && Number.isFinite(Number(employee.performanceScore)))
  const employeesWithIncrement = employees.filter((employee) => employee.incrementPercent != null)
  const displayedIncrements = isImported ? selected.incrementApprovedRows : employeesWithIncrement
  const incrementAverage = isImported ? selected.incrementAveragePercent : employeesWithIncrement.length ? employeesWithIncrement.reduce((sum, employee) => sum + employee.incrementPercent, 0) / employeesWithIncrement.length : null
  const averageScore = scoredEmployees.length ? scoredEmployees.reduce((sum, employee) => sum + Number(employee.performanceScore), 0) / scoredEmployees.length : null
  const scoreDistribution = [
    { score: 'Below 3', count: scoredEmployees.filter((employee) => employee.performanceScore < 3).length },
    { score: '3.0â€“3.5', count: scoredEmployees.filter((employee) => employee.performanceScore >= 3 && employee.performanceScore < 3.5).length },
    { score: '3.5â€“4.0', count: scoredEmployees.filter((employee) => employee.performanceScore >= 3.5 && employee.performanceScore < 4).length },
    { score: '4.0â€“4.5', count: scoredEmployees.filter((employee) => employee.performanceScore >= 4 && employee.performanceScore < 4.5).length },
    { score: '4.5+', count: scoredEmployees.filter((employee) => employee.performanceScore >= 4.5).length },
  ]
  const incrementDistribution = getIncrementDistribution(displayedIncrements, incrementBandLimits)
  const highPerformers = employees.filter((employee) => employee.performanceScore >= 4.2)
  const actual = isImported ? selected.incrementMonthlyCostImpact : employees.reduce((sum, employee) => sum + employee.monthlySalary - employee.monthlyBase, 0)
  const budget = isImported ? selected.incrementBudget : employees.reduce((sum, employee) => sum + employee.monthlyBase * 0.1, 0)
  const budgetData = [{ category: 'Monthly increment cost', Budget: Math.round(budget), Actual: Math.round(actual) }]
  const budgetChartReady = isImported
    ? selected.incrementBudgetComplete && selected.incrementComplete && budget != null && actual != null
    : employees.length > 0
  return (
    <>
      <div className="metric-grid four-metrics">
        <MetricCard label="Average PMS score" value={averageScore == null ? 'Not provided' : averageScore.toFixed(2)} detail={isImported ? `Out of 5.0 · ${scoredEmployees.length} reported scores` : 'Out of 5.0 · synthetic scores'} tone="blue" icon={Sparkles} />
        <MetricCard label="High performers" value={highPerformers.length} detail="Score â‰¥ 4.2 / 5.0" tone="green" icon={ArrowUpRight} />
        <MetricCard label="Average increment" value={isImported && !selected.incrementAccess ? 'Restricted' : incrementAverage == null ? 'Not provided' : `${incrementAverage.toFixed(1)}%`} detail={isImported ? !selected.incrementAccess ? 'Requires increments.read permission' : `${selected.incrementApprovedCount || 0} approved changes effective this month` : `Across ${employeesWithIncrement.length} active employees`} tone="violet" icon={Activity} />
        <MetricCard label="Increment budget" value={isImported && !selected.incrementAccess ? 'Restricted' : budget == null ? 'Not provided' : formatINR(budget, true)} detail={isImported ? !selected.incrementAccess ? 'Requires increments.read permission' : selected.incrementBudgetFiltersSupported ? selected.incrementBudgetVariance == null ? 'Requires complete approved Increment and HR Budget sources' : `Monthly run-rate variance ${formatINR(selected.incrementBudgetVariance, true)}` : 'Budget cannot be segmented by location or employment type' : `10% of base payroll · actual ${formatINR(actual, true)}`} tone="amber" icon={Wallet} />
      </div>
      {(!isImported || selected.incrementAccess) && <IncrementBandSettings limits={incrementBandLimits} onChange={onIncrementBandLimitsChange} />}
      <div className="chart-grid">
        <ChartPanel title="PMS score distribution" subtitle="Active workforce Â· score out of 5" className="wide-panel">
          {employees.length ? <ResponsiveContainer width="100%" height="100%">
            <BarChart data={scoreDistribution} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f5" vertical={false} /><XAxis dataKey="score" axisLine={false} tickLine={false} tick={{ fill: '#7d8492', fontSize: 10 }} dy={8} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="count" name="Employees" fill="#627cf5" radius={[5, 5, 0, 0]} barSize={30} />
            </BarChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
        <ChartPanel title="Increment percentage distribution" subtitle={isImported ? `Configured bands · ${selected.incrementPendingCount || 0} pending · ${selected.incrementRejectedCount || 0} rejected` : 'Synthetic employees grouped by configured bands'}>
          {isImported && !selected.incrementAccess ? <EmptyChart message="Increment analytics require increments.read permission." /> : isImported && !selected.incrementComplete ? <EmptyChart message="A complete Increment source is required for this month." /> : displayedIncrements.some((row) => row.incrementPercent != null) ? <WorkforceTable data={incrementDistribution} dataKey="count" /> : <EmptyChart message="No approved increment changes with a reported or derivable percentage are effective this month." />}
        </ChartPanel>
        <ChartPanel title="Department-wise increment analysis" subtitle="Approved increment percentage and reported PMS score" className="wide-panel">
          {employees.length && (!isImported || (selected.incrementAccess && selected.incrementComplete)) ? <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={departments.map((item) => {
              const team = employees.filter((employee) => employee.department === item.department)
              const teamIncrements = team.filter((employee) => employee.incrementPercent != null)
              const importedDepartment = selected.incrementDepartmentData.find((row) => row.department === item.department)
              const teamScores = team.filter((employee) => employee.performanceScore != null && Number.isFinite(Number(employee.performanceScore)))
              return { ...item, increment: isImported ? importedDepartment?.averageIncrementPercent ?? null : teamIncrements.length ? teamIncrements.reduce((sum, employee) => sum + employee.incrementPercent, 0) / teamIncrements.length : null, score: teamScores.length ? teamScores.reduce((sum, employee) => sum + Number(employee.performanceScore), 0) / teamScores.length : null }
            })} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f5" vertical={false} /><XAxis dataKey="department" axisLine={false} tickLine={false} tick={{ fill: '#7d8492', fontSize: 9 }} dy={8} /><YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} unit="%" /><YAxis yAxisId="right" orientation="right" domain={[0, 5]} axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} /><Bar yAxisId="left" dataKey="increment" name="Average increment %" fill="#8b7cf6" radius={[4, 4, 0, 0]} barSize={22} /><Line yAxisId="right" dataKey="score" name="Average PMS score" stroke="#55b6a5" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
        <ChartPanel title="Increment budget vs. actual" subtitle={isImported ? 'Monthly approved increment run-rate vs. HR Budget · INR' : 'Monthly cost · synthetic budget proxy assumes 10% of base payroll · INR'}>
          {budgetChartReady && (!isImported || selected.incrementAccess) ? <ResponsiveContainer width="100%" height="100%">
            <BarChart data={budgetData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f5" vertical={false} /><XAxis dataKey="category" hide /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} tickFormatter={(value) => `${Math.round(value / 100000)}L`} /><Tooltip content={<ChartTooltip currency formatINR={formatINR} />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} /><Bar dataKey="Budget" fill="#b9c3e8" radius={[4, 4, 0, 0]} barSize={38} /><Bar dataKey="Actual" fill="#627cf5" radius={[4, 4, 0, 0]} barSize={38} />
            </BarChart>
          </ResponsiveContainer> : <EmptyChart message={isImported ? !selected.incrementAccess ? 'Increment analytics require increments.read permission.' : selected.incrementBudgetFiltersSupported ? 'Complete Increment and HR Budget sources are required for this period.' : 'Budget source cannot be segmented by the selected location or employment type.' : undefined} />}
        </ChartPanel>
      </div>
      <EmployeeTable employees={highPerformers} title="High performer analysis" description="Employees with a PMS score of 4.2 or higher" sourceLabel={sourceLabel} columns={[
        { key: 'name', label: 'Employee' }, { key: 'department', label: 'Department' }, { key: 'performanceScore', label: 'PMS score', format: (value) => `${value} / 5` }, { key: 'incrementPercent', label: isImported ? 'PMS reported increment' : 'Increment', format: (value) => value == null ? 'â€”' : `${value}%` },
      ]} />
      {isImported && selected.incrementAccess && <EmployeeTable employees={selected.incrementRows.map((row) => ({ ...row, id: `${row.employeeId}-${row.effectiveDate}`, name: row.employeeName }))} title="Effective increment changes" description={selected.incrementComplete ? 'Approved, pending, and rejected changes effective in the selected month' : 'Provisional increment rows · this source month is not confirmed complete'} sourceLabel={sourceLabel} columns={[
        { key: 'name', label: 'Employee' }, { key: 'department', label: 'Department' }, { key: 'effectiveDate', label: 'Effective date' }, { key: 'incrementPercent', label: 'Increment %', format: (value) => value == null ? 'Not provided' : `${value.toFixed(1)}%` }, { key: 'annualCostImpact', label: 'Annual CTC change', format: (value) => formatINR(value) }, { key: 'approvalStatus', label: 'Approval status' },
      ]} />}
    </>
  )
}

function ProjectsView({ employees, trends, projectAssignments = employees, selectedMonth, selectedDate, filters, getPeriodMetrics = getMonthMetrics, isImported = false, sourceLabel, canReadPayroll = true, projectCostBasis = 'hybrid', onProjectCostBasisChange = () => {} }) {
  const [selectedProject, setSelectedProject] = useState('All projects')
  const selected = getPeriodMetrics(selectedMonth, filters, selectedDate, { projectCostBasis })
  const allProjectData = isImported ? selected.projectAllocationData : getGroupData(projectAssignments, 'project', 'project').map((item) => {
    const members = projectAssignments.filter((employee) => employee.project === item.project)
    const averageAllocation = members.length ? members.reduce((sum, employee) => sum + employee.allocation, 0) / members.length : 0
    return {
      ...item,
      allocated: Math.round(averageAllocation),
      available: Math.round(100 - averageAllocation),
      cost: Math.round(members.reduce((sum, employee) => sum + employee.monthlySalary * employee.allocation / 100, 0)),
    }
  })
  const projectOptions = [...new Set(allProjectData.map((project) => project.project))].sort((a, b) => a.localeCompare(b))
  const projectData = selectedProject === 'All projects' ? allProjectData : allProjectData.filter((project) => project.project === selectedProject)
  const allAllocationDirectory = isImported ? selected.projectAllocationRows : projectAssignments
  const allocationDirectory = selectedProject === 'All projects'
    ? allAllocationDirectory
    : allAllocationDirectory.filter((employee) => employee.project === selectedProject)
  const assignedEmployeeIds = new Set(allocationDirectory.map((employee) => employee.employeeRecordId || employee.employeeId || employee.id))
  const activeResourceCount = selectedProject === 'All projects' ? employees.length : assignedEmployeeIds.size
  const allocated = selectedProject === 'All projects'
    ? employees.reduce((sum, employee) => sum + Number(employee.allocation || 0), 0)
    : allocationDirectory.reduce((sum, employee) => sum + Number(employee.allocation || 0), 0)
  const utilisation = activeResourceCount ? allocated / activeResourceCount : 0
  const projectCostAvailable = isImported
    ? selected.projectAllocationCostAvailable && projectData.length > 0 && projectData.every((project) => project.cost != null)
    : true
  const projectCost = projectCostAvailable
    ? projectData.reduce((sum, project) => sum + Number(project.cost || 0), 0)
    : null
  return (
    <>
      <div className="metric-grid four-metrics">
        <MetricCard label="Projects represented" value={projectData.length} detail={isImported ? 'With monthly allocation records' : 'In the active workforce'} tone="blue" icon={BriefcaseBusiness} />
        <MetricCard label="Average allocation" value={`${utilisation.toFixed(1)}%`} detail="Across active employees" tone="teal" icon={Activity} />
        <MetricCard label="Allocated gross cost" value={!canReadPayroll ? 'Restricted' : projectCost == null ? 'Unavailable' : projectCost} formatValue={canReadPayroll && projectCost != null ? (value) => formatINR(value, true) : undefined} detail={!canReadPayroll ? 'Requires payroll.read permission' : isImported ? selected.projectAllocationCostBasisLabel : 'Allocation-weighted monthly cost'} tone="violet" icon={Wallet} />
        <MetricCard label="Active resources" value={activeResourceCount} detail={`${allocated} total allocation points`} tone="green" icon={UsersRound} />
      </div>
      <div className="project-filter-row">
        <label className="filter-control project-filter-control"><span>Project</span><select aria-label="Project" value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}><option>All projects</option>{projectOptions.map((project) => <option key={project} value={project}>{project}</option>)}</select></label>
        {isImported && canReadPayroll && <label className="filter-control project-filter-control"><span>Cost basis</span><select aria-label="Project cost basis" value={projectCostBasis} onChange={(event) => onProjectCostBasisChange(event.target.value)}><option value="hybrid">Best available per employee</option><option value="payroll">Payroll monthly gross</option><option value="allocation">Allocation row monthly gross</option></select></label>}
        <p>Project selection scopes allocation, utilization, cost, and directory results. People movement remains scoped to the workforce filters.</p>
      </div>
      <div className="chart-grid">
        <ChartPanel title="Project-wise headcount" subtitle={isImported ? 'Employees with allocation records in the selected month' : 'Active employees assigned to each project'} className="wide-panel">
          <WorkforceTable data={projectData} />
        </ChartPanel>
        <ChartPanel title="Resource utilisation" subtitle="Allocated vs. available employee capacity">
          {projectData.length ? <ResponsiveContainer width="100%" height="100%">
            <BarChart data={projectData} layout="vertical" margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f5" horizontal={false} /><XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} unit="%" /><YAxis type="category" dataKey="project" width={95} axisLine={false} tickLine={false} tick={{ fill: '#6f7787', fontSize: 9 }} /><Tooltip content={<ChartTooltip />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} /><Bar dataKey="allocated" name="Allocated capacity" stackId="a" fill="#627cf5" /><Bar dataKey="available" name="Available capacity" stackId="a" fill="#e9ecf4" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
        <ChartPanel title="Project monthly gross cost" subtitle={`${isImported ? selected.projectAllocationCostBasisLabel : 'Allocation-weighted salary'} Â· INR`} className="wide-panel">
          {!canReadPayroll ? <EmptyChart message="Project cost analytics require payroll.read permission." /> : !projectCostAvailable ? <EmptyChart message="The selected cost basis is missing for one or more allocations or its source period is incomplete." /> : <WorkforceTable data={projectData} dataKey="cost" valueFormat={(value) => formatINR(value, true)} />}
        </ChartPanel>
        <ChartPanel title="Monthly project people movement" subtitle={`Joiners, exits and project transfers Â· ${trendPeriodLabel(trends)}`} className="wide-panel">
          {(isImported ? trends.length > 0 : employees.length > 0) ? <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trends} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f5" vertical={false} /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 11 }} dy={8} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} /><Bar dataKey="joiners" name="Joiners" fill="#55b6a5" radius={[3, 3, 0, 0]} barSize={14} /><Bar dataKey="exits" name="Exits" fill="#e5798c" radius={[3, 3, 0, 0]} barSize={14} /><Bar dataKey="projectTransfers" name="Project transfers" fill="#8b7cf6" radius={[3, 3, 0, 0]} barSize={14} />
            </ComposedChart>
          </ResponsiveContainer> : <EmptyChart />}
        </ChartPanel>
      </div>
      <EmployeeTable employees={allocationDirectory} title="Project allocation directory" description="Project assignment and allocation percentages for the selected period" sourceLabel={sourceLabel} columns={[
        { key: 'name', label: 'Employee' }, { key: 'department', label: 'Department' }, { key: 'project', label: 'Project' }, { key: 'allocation', label: 'Allocation', format: (value) => `${value}%` }, ...(canReadPayroll ? [{ key: 'monthlySalary', label: 'Monthly gross basis', format: (value) => value == null ? 'Unavailable' : formatINR(value) }, { key: 'allocationWeightedCost', label: 'Allocated cost', format: (value) => value == null ? 'Unavailable' : formatINR(value) }] : []),
      ]} />
    </>
  )
}


export default function DashboardModules(props) {
  const { page } = props
  switch (page) {
    case 'executive': return <ExecutiveView {...props} />
    case 'workforce': return <WorkforceView {...props} />
    case 'payroll': return <PayrollView {...props} />
    case 'attendance': return <AttendanceView {...props} />
    case 'performance': return <PerformanceView {...props} />
    case 'projects': return <ProjectsView {...props} />
    default: return null
  }
}
