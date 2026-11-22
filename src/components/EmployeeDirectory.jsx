import { useMemo, useState } from 'react'
import { Download, Search, UserRound, X } from 'lucide-react'
import { Panel } from './DashboardParts'
import { serializeCsv } from '../data/csv'

const display = (value) => value == null || value === '' ? 'Not provided' : value
const historyAttributes = [
  ['department', 'Department'], ['location', 'Location'], ['designation', 'Designation'],
  ['grade', 'Grade'], ['employmentType', 'Employment type'], ['managerEmployeeId', 'Manager ID'], ['costCentre', 'Cost centre'],
]

export default function EmployeeDirectory({ employees, asOfDate, sourceLabel, rosterComplete }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return employees
    return employees.filter((employee) => [employee.id, employee.name, employee.company, employee.department, employee.designation, employee.grade, employee.location, employee.employmentType, employee.status]
      .some((value) => String(value ?? '').toLowerCase().includes(needle)))
  }, [employees, query])

  const exportCsv = () => {
    const csv = serializeCsv(
      ['Employee ID', 'Employee Name', 'Company', 'Department', 'Designation', 'Grade', 'Location', 'Employment Type', 'Hire Date', 'Exit Date', 'Status'],
      filtered.map((employee) => [employee.id, employee.name, employee.company, employee.department, employee.designation, employee.grade, employee.location, employee.employmentType, employee.hireDate, employee.exitDate, employee.status]),
    )
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `peoplepulse-employee-master-${asOfDate}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const activeProject = selected?.projectAssignments?.length
    ? selected.projectAssignments.map((item) => `${item.project}${item.allocationPercentage == null ? '' : ` (${item.allocationPercentage}%)`}`).join(', ')
    : selected?.project || 'Not provided'
  const history = [
    ...(selected?.hireDate ? [{ date: selected.hireDate, label: 'Joined the organisation' }] : []),
    ...(selected?.effectiveHistory || []).map((item) => {
      const attributes = historyAttributes
        .filter(([key]) => item[key] != null && String(item[key]).trim() !== '')
        .map(([key, label]) => `${label}: ${item[key]}`)
      return { date: item.effectiveFrom, label: `Workforce attributes effective${attributes.length ? ` · ${attributes.join(' · ')}` : ''}`, endDate: item.effectiveTo }
    }),
    ...(selected?.projectHistory || []).map((item) => ({ date: item.date, label: `Moved to project: ${item.project}` })),
    ...(selected?.exitDate ? [{ date: selected.exitDate, label: 'Exit date recorded' }] : []),
  ].filter((item) => item.date && item.date <= asOfDate).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <>
      {!rosterComplete && <div className="synthetic-banner imported-source-banner"><span><b>Roster is not confirmed complete.</b> This directory shows only staged Employee Master rows and may omit employees.</span></div>}
      <Panel title="Employee Master" subtitle={`${sourceLabel} · status evaluated as of ${asOfDate}`} className="table-panel employee-directory-panel" action={<button type="button" className="export-button" onClick={exportCsv}><Download size={14} /> Export filtered CSV</button>}>
        <div className="table-toolbar">
          <div className="table-count"><UserRound size={15} /><span><b>{filtered.length}</b> of {employees.length} records</span></div>
          <label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee master..." aria-label="Search employee master" /></label>
        </div>
        <div className="table-scroll"><table>
          <thead><tr><th>Employee ID</th><th>Employee</th><th>Company</th><th>Department</th><th>Designation</th><th>Grade</th><th>Location</th><th>Employment type</th><th>Hire date</th><th>Exit date</th><th>Status</th></tr></thead>
          <tbody>{filtered.map((employee) => <tr key={employee.employeeRecordId || employee.id}>
            <td>{employee.id}</td>
            <td><button type="button" className="employee-profile-link" onClick={() => setSelected(employee)}>{employee.name}</button></td>
            <td>{display(employee.company)}</td><td>{display(employee.department)}</td><td>{display(employee.designation)}</td><td>{display(employee.grade)}</td><td>{display(employee.location)}</td>
            <td>{display(employee.employmentType)}</td><td>{display(employee.hireDate)}</td><td>{display(employee.exitDate)}</td>
            <td><span className={`employee-status ${employee.status === 'Active' ? 'active' : employee.status === 'Exited' ? 'exited' : ''}`}>{employee.status}</span></td>
          </tr>)}</tbody>
        </table></div>
        {filtered.length === 0 && <div className="import-empty"><Search size={17} /><span>{employees.length ? 'No employees match this search.' : 'No employee records are available for this source.'}</span></div>}
        <div className="table-footnote">{sourceLabel}. Employee records shown here do not include payroll or other compensation fields.</div>
      </Panel>

      {selected && <div className="employee-profile-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}>
        <section className="employee-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="employee-profile-title">
          <header><div><span className="eyebrow">EMPLOYEE PROFILE</span><h2 id="employee-profile-title">{selected.name}</h2><p>{selected.id}</p></div><button type="button" className="icon-button" aria-label="Close employee profile" onClick={() => setSelected(null)}><X size={18} /></button></header>
          <dl className="employee-profile-grid">
            <div><dt>Status as of {asOfDate}</dt><dd>{selected.status}</dd></div><div><dt>Company</dt><dd>{display(selected.company)}</dd></div><div><dt>Department</dt><dd>{display(selected.department)}</dd></div>
            <div><dt>Designation</dt><dd>{display(selected.designation)}</dd></div><div><dt>Grade</dt><dd>{display(selected.grade)}</dd></div><div><dt>Location</dt><dd>{display(selected.location)}</dd></div>
            <div><dt>Employment type</dt><dd>{display(selected.employmentType)}</dd></div><div><dt>Manager employee ID</dt><dd>{display(selected.managerEmployeeId)}</dd></div><div><dt>Cost centre</dt><dd>{display(selected.costCentre)}</dd></div><div><dt>Hire date</dt><dd>{display(selected.hireDate)}</dd></div>
            <div><dt>Exit date</dt><dd>{display(selected.exitDate)}</dd></div><div><dt>Current project allocation</dt><dd>{activeProject}</dd></div>
          </dl>
          <div className="employee-history"><h3>Recorded history</h3>{history.length ? <ol>{history.map((item, index) => <li key={`${item.date}-${index}`}><time>{item.date}{item.endDate ? ` – ${item.endDate}` : ''}</time><span>{item.label}</span></li>)}</ol> : <p>No effective-dated history is available in this source.</p>}</div>
        </section>
      </div>}
    </>
  )
}
