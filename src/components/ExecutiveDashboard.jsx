import { Activity, BriefcaseBusiness, CalendarDays, ClipboardList, DoorOpen, GraduationCap, UserPlus, UserRoundCheck, UsersRound } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import AppErrorBoundary from './AppErrorBoundary'
import { getExecutivePeriodComparisons } from '../data/periodComparisons'
import './ExecutiveDashboard.css'

const colors = ['#11599a', '#0b8a79', '#e88836', '#7454ac', '#1683aa', '#c64e71', '#65788e']
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 })
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const display = (value, formatter = number) => Number.isFinite(value) ? formatter.format(value) : 'Unavailable'
const percent = (value) => Number.isFinite(value) ? display(value) + '%' : 'Unavailable'
const unavailable = (detail) => <div className="exec-unavailable"><strong>Unavailable</strong><span>{detail}</span></div>

function group(rows, label) {
  const counts = new Map()
  for (const row of rows) {
    const name = label(row) || 'Not specified'
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  return [...counts].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

function Panel({ title, children, className = '', id }) {
  return <section id={id} className={'exec-panel ' + className}>
    <h2>{title}</h2>
    <AppErrorBoundary moduleTitle={title}>{children}</AppErrorBoundary>
  </section>
}

function Breakdown({ rows, donut = false, category }) {
  if (!rows.length || !rows.some(({ value }) => value > 0)) return <p className="exec-empty">No records in this selection.</p>
  const max = Math.max(...rows.map(({ value }) => value))
  return <div className={donut ? 'exec-breakdown exec-donut' : 'exec-breakdown'}>
    {donut && <div className="exec-ring" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><PieChart>
      <Pie data={rows} nameKey="name" dataKey="value" innerRadius="58%" outerRadius="92%" isAnimationActive={false}>
        {rows.map(({ name }, index) => <Cell key={name} fill={colors[index % colors.length]} />)}
      </Pie>
    </PieChart></ResponsiveContainer></div>}
    <ul>{rows.map(({ name, value }, index) => {
      const color = colors[index % colors.length]
      return <li key={name} data-sample-export={category || undefined} data-sample-category={category} data-sample-metric={name} data-sample-value={value}><span><i style={{ background: color }} />{name}</span><b>{display(value)}</b>
        {!donut && <div className="exec-track"><i style={{ background: color, width: (value / max * 100) + '%' }} /></div>}
      </li>
    })}</ul>
  </div>
}

function Trend({ rows, turnover = false, series }) {
  const line = series?.line || turnover
  const keys = series ? [series.key] : turnover ? ['attrition'] : ['joiners', 'exits']
  if (!rows.some((row) => keys.some((key) => Number.isFinite(row[key])))) return unavailable('No complete reporting months for these filters.')
  const axes = <><CartesianGrid stroke="#e7eef5" vertical={false} /><XAxis dataKey="month" tickLine={false} tick={{ fontSize: 10 }} />
    <YAxis width={34} tick={{ fontSize: 10 }} allowDecimals={turnover || Boolean(series?.percent)} tickFormatter={turnover || series?.percent ? percent : undefined} /><Tooltip /><Legend iconSize={9} /></>
  return <div className="exec-chart"><ResponsiveContainer width="100%" height="100%">
    {line ? <LineChart data={rows}>{axes}<Line dataKey={series?.key || "attrition"} name={series?.name || "Turnover (%)"} stroke={colors[0]} strokeWidth={2} isAnimationActive={false} /></LineChart>
      : <BarChart data={rows}>{axes}{series ? <Bar dataKey={series.key} name={series.name} fill={colors[0]} isAnimationActive={false} /> : <><Bar dataKey="joiners" name="New hires" fill={colors[0]} isAnimationActive={false} /><Bar dataKey="exits" name="Exits" fill={colors[2]} isAnimationActive={false} /></>}</BarChart>}
  </ResponsiveContainer></div>
}

function Facts({ rows, category }) {
  return <dl className="exec-facts">{rows.map(([label, value]) => <div key={label} data-sample-export={category || undefined} data-sample-category={category} data-sample-metric={label} data-sample-value={value}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

export default function ExecutiveDashboard({ metrics, trends, month, monthEnd, financialYearStartMonth, canReadPayroll, canReadLeave, recruitment, sourceLabel, sample }) {
  const { headcount, payroll, attendance, leave } = metrics
  const employees = headcount.activeEmployees
  const current = sample?.current
  const complete = headcount.complete
  const departments = group(employees, (row) => row.department)
  const genders = group(employees, (row) => row.gender)
  const tenureBands = ['Under 1 year', '1–2 years', '3–4 years', '5–7 years', '8+ years']
  const tenure = group(employees.filter((row) => row.hireDate && Number.isFinite(row.tenureYears)), ({ tenureYears }) =>
    tenureBands[tenureYears < 1 ? 0 : tenureYears < 3 ? 1 : tenureYears < 5 ? 2 : tenureYears < 8 ? 3 : 4])
    .sort((a, b) => tenureBands.indexOf(a.name) - tenureBands.indexOf(b.name))
  const rosterReason = 'Requires a complete roster for this period.'
  const absenceReason = 'Unplanned absence days and scheduled days are required.'
  const trainingReason = 'No training-hours source is connected.'
  const actionsReason = 'No HR action register is connected.'
  const tiles = [
    ['Total Headcount', complete ? display(headcount.closing) : 'Unavailable', complete ? 'Closing roster for this selection' : rosterReason, UsersRound, '#104c83'],
    ['Active Employees', complete ? display(employees.length) : 'Unavailable', complete ? 'Active as of the selected date' : rosterReason, UserRoundCheck, '#007762'],
    ['New Hires', complete ? display(headcount.joiners) : 'Unavailable', complete ? 'Hires in the selected period' : rosterReason, UserPlus, '#125b9e'],
    ['Exits', complete ? display(headcount.exits) : 'Unavailable', complete ? 'Confirmed exits in the period' : rosterReason, DoorOpen, '#ab3043'],
    ['Turnover Rate', complete ? percent(headcount.attritionRate) : 'Unavailable', complete && headcount.attritionRate != null ? 'Exits ÷ average headcount' : 'Requires exits and a nonzero average headcount.', Activity, '#a94c10'],
    ['Absence Rate', percent(current?.absenceRate), current ? 'Absent scheduled days divided by scheduled days' : absenceReason, CalendarDays, '#57408b'],
    ['Training Hours', display(current?.training), current ? 'Training hours in the selected period' : trainingReason, GraduationCap, '#08717c'],
    ['Open HR Actions', display(current?.openActions), current ? 'Open, overdue or in-progress tasks' : actionsReason, ClipboardList, '#16486f'],
  ]
  const availableHistory = trends.filter((row) => monthEnd ? row.reportingMonth <= month : row.reportingMonth < month)
  const history = availableHistory.slice(-12)
  const previous = history.at(-2)
  const comparisons = current ? previous ? [{
    label: 'Selected period vs prior month',
    headcountChange: previous.headcount ? (current.headcount - previous.headcount) / previous.headcount * 100 : null,
    payrollChange: sample.monthEnd && previous.payroll
      ? (current.payroll - previous.payroll) / previous.payroll * 100 : null,
  }] : [] : getExecutivePeriodComparisons(availableHistory, month, financialYearStartMonth)
  const payAvailable = canReadPayroll && monthEnd && payroll.available && payroll.complete && payroll.missingEmployeeCount === 0
  const attendanceAvailable = monthEnd && attendance.available && attendance.measuredEmployeeCount > 0
  const knownGender = genders.filter(({ name }) => name !== 'Not specified')
  return <div className="executive-redesign" aria-label="Executive workforce analytics">
    <div className="exec-kpis">{tiles.map(([label, value, detail, Icon, color]) => <section className="exec-tile" key={label} style={{ '--tile-color': color }} data-sample-export data-sample-category="KPI" data-sample-metric={label} data-sample-value={value} data-unavailable={value === 'Unavailable'}>
      <Icon size={18} aria-hidden="true" /><div><h2>{label}</h2><strong>{value}</strong><p>{detail}</p></div>
    </section>)}</div>
    <div className="exec-grid exec-grid-four">
      <Panel id={sample ? 'sample-workforce' : undefined} title="Headcount by department"><Breakdown category="Department headcount" rows={departments} /></Panel>
      <Panel title="Employment status"><Breakdown category="Employment status" donut rows={complete ? [{ name: 'Active at close', value: headcount.closing }, { name: 'Exited this period', value: headcount.exits }] : []} />{!complete && <p className="exec-note">{rosterReason}</p>}</Panel>
      <Panel title="Gender distribution"><Breakdown category="Gender distribution" donut rows={genders} /></Panel>
      <Panel title="Age profile">{current ? <Breakdown category="Age profile" rows={group(employees, ({ age }) => age < 25 ? 'Under 25' : age < 35 ? '25-34' : age < 45 ? '35-44' : age < 55 ? '45-54' : '55+').sort((a, b) => (Number.parseInt(a.name) || 0) - (Number.parseInt(b.name) || 0))} /> : unavailable('Date of birth is outside the scoped employee dataset.')}</Panel>
    </div>
    <div className="exec-grid exec-grid-five">
      <Panel title="Years of service"><Breakdown category="Years of service" rows={tenure} /></Panel>
      <Panel title="Recruitment versus exits"><Trend rows={history} /></Panel>
      <Panel title="Absence trends">{current ? <Trend rows={history} series={{ key: 'absenceRate', name: 'Absence rate (%)', line: true, percent: true }} /> : unavailable(absenceReason)}</Panel>
      <Panel title="Training and competency">{current ? <>
        <Trend rows={history} series={{ key: 'training', name: 'Training hours' }} />
        <Facts category="Training program hours" rows={current.trainingByProgram.map(({ program, hours }) => [program, display(hours)])} />
      </> : unavailable(trainingReason)}</Panel>
      <Panel title="HR action priorities">{current ? <Breakdown donut category="Open HR actions by priority" rows={group(current.actionRows.filter(({ status }) => status !== 'Complete'), (row) => row.priority)} /> : unavailable(actionsReason)}</Panel>
    </div>
    <div className="exec-grid exec-grid-six">
      <Panel title="Attrition and turnover"><Trend rows={history} turnover /></Panel>
      <Panel title="Recruitment funnel">{recruitment ? <Facts category="Management summary" rows={[
        ...(current ? [['Applications', display(recruitment.applications)], ['Screened', display(recruitment.screened)], ['Interviewed', display(recruitment.interviewed)]] : [['Approved positions', display(recruitment.approvedPositions)]]), ['Offers extended', display(recruitment.offersExtended)],
        ['Offers accepted', display(recruitment.offersAccepted)], ['Positions filled', display(recruitment.positionsFilled)],
      ]} /> : unavailable('Requires complete requisition records and compatible filters.')}</Panel>
      <Panel title="Payroll and compensation">{payAvailable ? <Facts category="Management summary" rows={[
        ['Reported gross payroll', display(payroll.gross, money)],
        ['Average annual CTC', payroll.employeeCount > 0 && payroll.missingAnnualCtcCount === 0 ? display(payroll.annualCtc / payroll.employeeCount, money) : 'Unavailable'],
      ]} /> : unavailable('Requires payroll access and complete month-end figures.')}</Panel>
      <Panel title="Attendance and leave"><Facts category="Management summary" rows={[
        ['Reported average attendance', attendanceAvailable ? percent(attendance.averagePercentage) : 'Unavailable'],
        ['Attendance records measured', attendanceAvailable ? display(attendance.measuredEmployeeCount) : 'Unavailable'],
        ['Leave used, reporting year', canReadLeave && leave.complete ? display(leave.availedDays) + ' days' : 'Unavailable'],
        ...(current ? [['Leave accrued, reporting year', display(sample.reportingYearLeaveAccrued) + ' days'],
          ['Leave balance, accrued less used', display(sample.reportingYearLeaveAccrued - sample.reportingYearLeave) + ' days']] : []),
      ]} /><p className="exec-note">{current ? 'Attendance is present days divided by scheduled days. Leave totals run from the reporting-year start through the selected date.' : 'Attendance needs month-end records. Leave totals require complete reporting-year coverage and leave access.'}</p></Panel>
      <Panel title="Diversity metrics"><Facts category="Management summary" rows={[
        ['Gender recorded', employees.length ? percent(knownGender.reduce((sum, row) => sum + row.value, 0) / employees.length * 100) : 'Unavailable'],
        ...(current ? [['Women in leadership', percent(current.womenInLeadership)], ['Disability representation', percent(current.disabilityRepresentation)]] : [['Leadership and disability', 'Unavailable']]),
      ]} />{!current && <p className="exec-note">Leadership and disability fields are outside the scoped dataset.</p>}</Panel>
      <Panel title="Employee engagement">{current ? <Facts category="Employee engagement" rows={[['eNPS', display(current.engagement.enps)], ['Responses', display(current.engagement.responses)], ['Promoters', display(current.engagement.promoters)], ['Passives', display(current.engagement.passives)], ['Detractors', display(current.engagement.detractors)]]} /> : unavailable('No engagement survey or eNPS source is connected.')}</Panel>
    </div>
    <div className="exec-grid exec-management">
      <Panel id={sample ? 'sample-checklist' : undefined} title="HR Checklist">
        <div className="exec-table" tabIndex={0} role="region" aria-label="HR Checklist table"><table><thead><tr>
          <th>Status</th><th>Responsible owner</th><th>Due date</th><th>Priority</th><th>Action required</th>
        </tr></thead><tbody>{current?.actionRows.length ? current.actionRows.map((row) => <tr key={row.id} data-sample-export data-sample-category="HR Checklist" data-sample-metric={row.action} data-sample-value={[row.status, row.owner, row.due, row.priority].join(' | ')}><td>{row.status}</td><td>{row.owner}</td><td>{row.due}</td><td>{row.priority}</td><td>{row.action}</td></tr>) : <tr><td colSpan={5}>{current ? 'No actions in this selection.' : 'Unavailable. ' + actionsReason}</td></tr>}</tbody></table></div>
      </Panel>
      <Panel id={sample ? 'sample-insights' : undefined} title="Management Insights"><ul className="exec-insights">
        {departments.length > 0 && <li><BriefcaseBusiness size={16} /><span><strong>{departments[0].name}</strong> is the largest department in the visible active roster with {display(departments[0].value)} employees.</span></li>}
        {complete && <li><Activity size={16} /><span>The selected period recorded <strong>{display(headcount.joiners)} hires</strong> and <strong>{display(headcount.exits)} confirmed exits</strong>.</span></li>}
        {current && <li data-sample-export data-sample-category="Management Insights" data-sample-metric="Absence and training" data-sample-value={current.absent + ' absent days / ' + current.scheduled + ' scheduled days; ' + current.training + ' training hours'}><CalendarDays size={16} /><span><strong>{display(current.absent)}</strong> of {display(current.scheduled)} scheduled days were unplanned absences. Employees logged {display(current.training)} training hours.</span></li>}
        {!complete && <li><ClipboardList size={16} /><span>{rosterReason}</span></li>}
      </ul></Panel>
    </div>
    <Panel title="Period comparisons">
      <div className="exec-table" tabIndex={0} role="region" aria-label="Period comparisons table"><table><thead><tr><th>Period</th><th>Headcount change</th><th>Payroll change</th></tr></thead>
        <tbody>{comparisons.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{percent(row.headcountChange)}</td><td>{canReadPayroll ? percent(row.payrollChange) : 'Unavailable'}</td></tr>)}
          {!comparisons.length && <tr><td colSpan={3}>No preceding period in this dataset.</td></tr>}</tbody>
      </table></div>
      <p className="exec-note">Changes require comparable complete reporting windows. {sourceLabel}</p>
    </Panel>
  </div>
}
