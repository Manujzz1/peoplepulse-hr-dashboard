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

function Panel({ title, children, className = '' }) {
  return <section className={'exec-panel ' + className}>
    <h2>{title}</h2>
    <AppErrorBoundary moduleTitle={title}>{children}</AppErrorBoundary>
  </section>
}

function Breakdown({ rows, donut = false }) {
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
      return <li key={name}><span><i style={{ background: color }} />{name}</span><b>{display(value)}</b>
        {!donut && <div className="exec-track"><i style={{ background: color, width: (value / max * 100) + '%' }} /></div>}
      </li>
    })}</ul>
  </div>
}

function Trend({ rows, turnover = false }) {
  const keys = turnover ? ['attrition'] : ['joiners', 'exits']
  if (!rows.some((row) => keys.some((key) => Number.isFinite(row[key])))) return unavailable('No complete reporting months for these filters.')
  const axes = <><CartesianGrid stroke="#e7eef5" vertical={false} /><XAxis dataKey="month" tickLine={false} tick={{ fontSize: 10 }} />
    <YAxis width={34} tick={{ fontSize: 10 }} allowDecimals={turnover} tickFormatter={turnover ? percent : undefined} /><Tooltip /><Legend iconSize={9} /></>
  return <div className="exec-chart"><ResponsiveContainer width="100%" height="100%">
    {turnover ? <LineChart data={rows}>{axes}<Line dataKey="attrition" name="Turnover (%)" stroke={colors[0]} strokeWidth={2} isAnimationActive={false} /></LineChart>
      : <BarChart data={rows}>{axes}<Bar dataKey="joiners" name="New hires" fill={colors[0]} isAnimationActive={false} /><Bar dataKey="exits" name="Exits" fill={colors[2]} isAnimationActive={false} /></BarChart>}
  </ResponsiveContainer></div>
}

function Facts({ rows }) {
  return <dl className="exec-facts">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

export default function ExecutiveDashboard({ metrics, trends, month, monthEnd, financialYearStartMonth, canReadPayroll, canReadLeave, recruitment, sourceLabel }) {
  const { headcount, payroll, attendance, leave } = metrics
  const employees = headcount.activeEmployees
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
    ['Absence Rate', 'Unavailable', absenceReason, CalendarDays, '#57408b'],
    ['Training Hours', 'Unavailable', trainingReason, GraduationCap, '#08717c'],
    ['Open HR Actions', 'Unavailable', actionsReason, ClipboardList, '#16486f'],
  ]
  const availableHistory = trends.filter((row) => monthEnd ? row.reportingMonth <= month : row.reportingMonth < month)
  const history = availableHistory.slice(-12)
  const comparisons = getExecutivePeriodComparisons(availableHistory, month, financialYearStartMonth)
  const payAvailable = canReadPayroll && monthEnd && payroll.available && payroll.complete && payroll.missingEmployeeCount === 0
  const attendanceAvailable = monthEnd && attendance.available && attendance.measuredEmployeeCount > 0
  const knownGender = genders.filter(({ name }) => name !== 'Not specified')
  return <div className="executive-redesign" aria-label="Executive workforce analytics">
    <div className="exec-kpis">{tiles.map(([label, value, detail, Icon, color]) => <section className="exec-tile" key={label} style={{ '--tile-color': color }} data-unavailable={value === 'Unavailable'}>
      <Icon size={18} aria-hidden="true" /><div><h2>{label}</h2><strong>{value}</strong><p>{detail}</p></div>
    </section>)}</div>
    <div className="exec-grid exec-grid-four">
      <Panel title="Headcount by department"><Breakdown rows={departments} /></Panel>
      <Panel title="Employment status"><Breakdown donut rows={complete ? [{ name: 'Active at close', value: headcount.closing }, { name: 'Exited this period', value: headcount.exits }] : []} />{!complete && <p className="exec-note">{rosterReason}</p>}</Panel>
      <Panel title="Gender distribution"><Breakdown donut rows={genders} /></Panel>
      <Panel title="Age profile">{unavailable('Date of birth is outside the scoped employee dataset.')}</Panel>
    </div>
    <div className="exec-grid exec-grid-five">
      <Panel title="Years of service"><Breakdown rows={tenure} /></Panel>
      <Panel title="Recruitment versus exits"><Trend rows={history} /></Panel>
      <Panel title="Absence trends">{unavailable(absenceReason)}</Panel>
      <Panel title="Training and competency">{unavailable(trainingReason)}</Panel>
      <Panel title="HR action priorities">{unavailable(actionsReason)}</Panel>
    </div>
    <div className="exec-grid exec-grid-six">
      <Panel title="Attrition and turnover"><Trend rows={history} turnover /></Panel>
      <Panel title="Recruitment funnel">{recruitment ? <Facts rows={[
        ['Approved positions', display(recruitment.approvedPositions)], ['Offers extended', display(recruitment.offersExtended)],
        ['Offers accepted', display(recruitment.offersAccepted)], ['Positions filled', display(recruitment.positionsFilled)],
      ]} /> : unavailable('Requires complete requisition records and compatible filters.')}</Panel>
      <Panel title="Payroll and compensation">{payAvailable ? <Facts rows={[
        ['Reported gross payroll', display(payroll.gross, money)],
        ['Average annual CTC', payroll.employeeCount > 0 && payroll.missingAnnualCtcCount === 0 ? display(payroll.annualCtc / payroll.employeeCount, money) : 'Unavailable'],
      ]} /> : unavailable('Requires payroll access and complete month-end figures.')}</Panel>
      <Panel title="Attendance and leave"><Facts rows={[
        ['Reported average attendance', attendanceAvailable ? percent(attendance.averagePercentage) : 'Unavailable'],
        ['Attendance records measured', attendanceAvailable ? display(attendance.measuredEmployeeCount) : 'Unavailable'],
        ['Leave used, reporting year', canReadLeave && leave.complete ? display(leave.availedDays) + ' days' : 'Unavailable'],
      ]} /><p className="exec-note">Attendance needs month-end records. Leave totals require complete reporting-year coverage and leave access.</p></Panel>
      <Panel title="Diversity metrics"><Facts rows={[
        ['Gender recorded', employees.length ? percent(knownGender.reduce((sum, row) => sum + row.value, 0) / employees.length * 100) : 'Unavailable'],
        ['Leadership and disability', 'Unavailable'],
      ]} /><p className="exec-note">Leadership and disability fields are outside the scoped dataset.</p></Panel>
      <Panel title="Employee engagement">{unavailable('No engagement survey or eNPS source is connected.')}</Panel>
    </div>
    <div className="exec-grid exec-management">
      <Panel title="HR Checklist">
        <div className="exec-table" tabIndex={0} role="region" aria-label="HR Checklist table"><table><thead><tr>
          <th>Status</th><th>Responsible owner</th><th>Due date</th><th>Priority</th><th>Action required</th>
        </tr></thead><tbody><tr><td colSpan={5}>Unavailable. {actionsReason}</td></tr></tbody></table></div>
      </Panel>
      <Panel title="Management Insights"><ul className="exec-insights">
        {departments.length > 0 && <li><BriefcaseBusiness size={16} /><span><strong>{departments[0].name}</strong> is the largest department in the visible active roster with {display(departments[0].value)} employees.</span></li>}
        {complete && <li><Activity size={16} /><span>The selected period recorded <strong>{display(headcount.joiners)} hires</strong> and <strong>{display(headcount.exits)} confirmed exits</strong>.</span></li>}
        {!complete && <li><ClipboardList size={16} /><span>{rosterReason}</span></li>}
      </ul></Panel>
    </div>
    <Panel title="Period comparisons">
      <div className="exec-table" tabIndex={0} role="region" aria-label="Period comparisons table"><table><thead><tr><th>Period</th><th>Headcount change</th><th>Payroll change</th></tr></thead>
        <tbody>{comparisons.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{percent(row.headcountChange)}</td><td>{canReadPayroll ? percent(row.payrollChange) : 'Unavailable'}</td></tr>)}</tbody>
      </table></div>
      <p className="exec-note">Changes require comparable complete reporting windows. {sourceLabel}</p>
    </Panel>
  </div>
}
