import { demoEmployees } from './demoData'
import { financialYearMonthsElapsed } from './reportingCalendar'

export const SAMPLE_NOTICE = 'TEMPORARY SAMPLE DATA — NOT ACTUAL ADTL REPORTING'
export const SAMPLE_VERSION = 'ADTL Executive sample v1'
export const SAMPLE_MONTHS = Array.from({ length: 12 }, (_, index) => '2025-' + String(index + 1).padStart(2, '0'))
const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const date = (month, day) => month + '-' + String(day).padStart(2, '0')
const getMonthEnd = (month) => date(month, new Date(Date.UTC(2025, Number(month.slice(-2)), 0)).getUTCDate())
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0)
const rate = (numerator, denominator) => denominator ? 100 * numerator / denominator : null

function yearsAt(start, end) {
  return Number(end.slice(0, 4)) - Number(start.slice(0, 4)) - (end.slice(5) < start.slice(5) ? 1 : 0)
}

const roster = demoEmployees.map((row, index) => ({
  id: row.id, department: row.department, location: row.location, employmentType: row.employmentType,
  gender: row.gender, hireDate: row.hireDate,
  exitDate: index < 96 && index % 7 === 0 ? date(SAMPLE_MONTHS[(index / 7) % 12], 11 + index % 11) : null,
  birthDate: String(Number(row.hireDate.slice(0, 4)) - 21 - index % 28) + '-' + row.hireDate.slice(5),
  monthlyBase: row.monthlyBase, leader: index % 9 === 0, disability: index % 29 === 0,
}))
export const SAMPLE_FILTERS = Object.fromEntries(['department', 'location', 'employmentType'].map((key) =>
  [key, [...new Set(roster.map((row) => row[key]))].sort()]))

const actionTemplates = [
  ['Review access attestations', 'HR Operations', 'High'],
  ['Confirm training completion', 'Learning Team', 'Medium'],
  ['Review payroll exceptions', 'Payroll Team', 'High'],
  ['Validate onboarding documents', 'Talent Acquisition', 'Low'],
  ['Review leave reconciliation', 'People Services', 'Medium'],
]

function summarize(people, month, asOf) {
  const start = date(month, 1)
  const index = SAMPLE_MONTHS.indexOf(month)
  const opening = people.filter((row) => row.hireDate < start && (!row.exitDate || row.exitDate >= start)).length
  const active = people.filter((row) => row.hireDate <= asOf && (!row.exitDate || row.exitDate > asOf))
    .map((row) => ({ ...row, age: yearsAt(row.birthDate, asOf), tenureYears: yearsAt(row.hireDate, asOf) }))
  const hires = people.filter((row) => row.hireDate >= start && row.hireDate <= asOf)
  const exits = people.filter((row) => row.exitDate >= start && row.exitDate <= asOf).length
  const records = people.flatMap((row) => {
    const id = Number(row.id.slice(4))
    const daily = []
    for (let day = 1; day <= Number(asOf.slice(-2)); day++) {
      const dayDate = date(month, day)
      const weekday = new Date(dayDate + 'T00:00:00Z').getUTCDay()
      if (weekday === 0 || weekday === 6 || dayDate < row.hireDate || (row.exitDate && dayDate >= row.exitDate)) continue
      const absence = Number((id * 7 + day * 11 + index * 13) % 53 < 2)
      const leave = Number(!absence && (id * 11 + day * 7 + index) % 41 < 2)
      daily.push({ scheduled: 1, absence, leave, present: 1 - absence - leave, gross: row.monthlyBase / workingDays(month), training: !absence && !leave && (id + 2 * day + index) % 11 === 0 ? 2 + id % 3 : 0 })
    }
    return daily.length ? [{ ...row, daily }] : []
  })
  const daily = records.flatMap((row) => row.daily)
  const scheduled = sum(daily, 'scheduled')
  const absent = sum(daily, 'absence')
  const present = sum(daily, 'present')
  const leaveDays = sum(daily, 'leave')
  const gross = Math.round(sum(daily, 'gross'))
  const responses = active.filter((row) => (Number(row.id.slice(4)) + index) % 5 !== 0)
  const promoters = responses.filter((row) => (Number(row.id.slice(4)) + index) % 10 >= 4).length
  const detractors = responses.filter((row) => (Number(row.id.slice(4)) + index) % 10 < 2).length
  const actionRows = records.filter((row) => (Number(row.id.slice(4)) + index) % 7 === 0).map((row) => {
    const i = Number(row.id.slice(4)) + index
    const [action, owner, priority] = actionTemplates[i % actionTemplates.length]
    const due = new Date(Date.UTC(2025, index, 16 + i % 12 + (i % 3 === 0 ? 18 : 0))).toISOString().slice(0, 10)
    const completed = i % 4 === 0 && asOf >= date(month, 5 + i % 10)
    return { id: row.id, action: action + ' · ' + row.department, owner, priority, due, status: completed ? 'Complete' : due < asOf ? 'Overdue' : i % 2 ? 'In progress' : 'Open' }
  })
  const opportunities = hires.length + records.filter((row) => (Number(row.id.slice(4)) + index) % 11 === 0).length
  const positionsFilled = hires.length
  const offersAccepted = positionsFilled + opportunities
  const offersExtended = offersAccepted + opportunities
  const interviewed = offersExtended + opportunities * 2
  const screened = interviewed + opportunities * 3
  const applications = screened + opportunities * 4
  return {
    month: labels[index], reportingMonth: month, headcount: active.length, opening, active, joiners: hires.length, exits,
    attrition: rate(exits, (opening + active.length) / 2), scheduled, absent, absenceRate: rate(absent, scheduled),
    attendanceRate: rate(present, scheduled), leaveDays, training: sum(daily, 'training'), payroll: gross, payrollComplete: true,
    annualCtc: Math.round(active.reduce((total, row) => total + row.monthlyBase * 12 * 1.15, 0)),
    openActions: actionRows.filter(({ status }) => status !== 'Complete').length, actionRows,
    recruitment: { applications, screened, interviewed, offersExtended, offersAccepted, positionsFilled },
    engagement: { responses: responses.length, promoters, passives: responses.length - promoters - detractors, detractors, enps: rate(promoters - detractors, responses.length) },
    womenInLeadership: rate(active.filter((row) => row.leader && row.gender === 'Female').length, active.filter((row) => row.leader).length),
    disabilityRepresentation: rate(active.filter((row) => row.disability).length, active.length),
    measuredEmployees: records.length,
  }
}

const workingDayCounts = Object.fromEntries(SAMPLE_MONTHS.map((month) => [month, Array.from({ length: Number(getMonthEnd(month).slice(-2)) }, (_, index) => {
  const weekday = new Date(date(month, index + 1) + 'T00:00:00Z').getUTCDay()
  return weekday > 0 && weekday < 6
}).filter(Boolean).length]))
const workingDays = (month) => workingDayCounts[month]

export function getExecutiveSample(month, asOf, filters = {}, financialYearStartMonth = 1) {
  if (!SAMPLE_MONTHS.includes(month)) return null
  const end = getMonthEnd(month)
  const selectedDate = /^2025-\d{2}-\d{2}$/.test(asOf) && asOf.startsWith(month + '-') && asOf >= date(month, 1) && asOf <= end ? asOf : end
  const people = roster.filter((row) => Object.keys(SAMPLE_FILTERS).every((key) => !filters[key] || row[key] === filters[key]))
  const history = SAMPLE_MONTHS.filter((period) => period <= month)
    .map((period) => summarize(people, period, period === month ? selectedDate : getMonthEnd(period)))
  const current = history.at(-1)
  return { current, history, selectedDate, monthEnd: selectedDate === end, reportingYearLeave: sum(history.slice(-financialYearMonthsElapsed(month, financialYearStartMonth)), 'leaveDays') }
}
