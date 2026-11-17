import { useMemo, useState } from 'react'
import { Activity, BriefcaseBusiness, Download, UsersRound, Wallet } from 'lucide-react'
import { MetricCard, Panel } from './DashboardParts'
import { formatINR } from '../data/demoData'
import { getPlanningReport } from '../data/planningModel'
import { serializeCsv } from '../data/csv'

const definitions = {
  recruitment: {
    title: 'Recruitment analytics',
    description: 'Track approved positions, requisition status, offers, and hiring timelines from staged recruitment data.',
    metrics: [
      { key: 'openPositions', label: 'Open positions', icon: BriefcaseBusiness },
      { key: 'positionsFilled', label: 'Positions filled', icon: UsersRound },
      { key: 'averageTimeToHireDays', label: 'Avg. time to hire', suffix: ' days', icon: Activity },
      { key: 'averageTimeToFillDays', label: 'Avg. time to fill', suffix: ' days', icon: Activity },
      { key: 'offerAcceptanceRate', label: 'Offer acceptance', suffix: '%', icon: Activity },
    ],
    columns: ['requisitionId', 'company', 'department', 'designation', 'status', 'approvedPositions', 'filledPositions', 'openPositions', 'requisitionDate', 'offersExtended', 'offersAccepted', 'offerDate', 'offerAcceptedDate', 'joiningDate', 'recruitmentSource', 'recruiter'],
  },
  contracts: {
    title: 'Contract manpower analytics',
    description: 'Review active contractor counts and vendor costs using only explicitly reported gross, service charge, and GST amounts.',
    metrics: [
      { key: 'activeContractors', label: 'Active contractors', icon: UsersRound },
      { key: 'vendorCount', label: 'Active vendors', icon: BriefcaseBusiness },
      { key: 'totalMonthlyCost', label: 'Total monthly vendor cost', money: true, icon: Wallet },
      { key: 'contractsExpiringIn30Days', label: 'Expiring in 30 days', icon: Activity },
    ],
    columns: ['contractorId', 'company', 'vendor', 'department', 'location', 'status', 'contractStartDate', 'contractEndDate', 'monthlyGross', 'vendorServiceCharges', 'monthlyGstAmount', 'totalMonthlyCost'],
  },
  budget: {
    title: 'HR budget analytics',
    description: 'Compare approved monthly budgets with actuals only where a matching complete source is available.',
    metrics: [
      { key: 'totalBudget', label: 'Approved budget', money: true, icon: Wallet },
      { key: 'actualTotal', label: 'Actual (all categories)', money: true, icon: Activity },
      { key: 'varianceTotal', label: 'Budget variance', money: true, icon: BriefcaseBusiness },
      { key: 'unavailableActualCount', label: 'Categories without actuals', icon: UsersRound },
    ],
    columns: ['reportingMonth', 'company', 'department', 'budgetCategory', 'budgetAmount', 'actual', 'variance', 'actualBasis', 'budgetOwner'],
  },
}

const titleCase = (value) => value.replaceAll(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase())
const formatValue = (value, definition) => value == null ? 'Unavailable' : definition.money ? formatINR(value, true) : `${value}${definition.suffix || ''}`

function displayRow(page, row) {
  if (page === 'recruitment') return { ...row, openPositions: row.status === 'Open' ? Math.max(Number(row.approvedPositions) - Number(row.filledPositions), 0) : 0 }
  if (page === 'contracts') return { ...row, totalMonthlyCost: Number(row.monthlyGross || 0) + Number(row.vendorServiceCharges || 0) + Number(row.monthlyGstAmount || 0) }
  return row
}

function completionStatus(page, month) {
  return <div className="planning-source-note"><strong>{page.complete ? 'Source marked complete' : 'Staged data is provisional'}</strong><span>{page.complete ? `All rows are declared complete for ${month}.` : `Source completeness is not confirmed for ${month}; totals may omit records.`}</span></div>
}

export default function PlanningModules({ page, dataSource, model, selectedMonth, selectedDate, filters, canReadIncrements = false }) {
  const [query, setQuery] = useState('')
  const config = definitions[page]
  const report = useMemo(() => dataSource === 'imported' ? getPlanningReport(model, page, selectedMonth, selectedDate, filters, { canReadIncrements }) : null, [dataSource, model, page, selectedMonth, selectedDate, filters, canReadIncrements])
  const rows = report?.rows.map((row) => displayRow(page, row)) || []
  const filteredRows = rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(query.toLowerCase())))
  const columns = config.columns
  const metricValues = report?.metrics || {}

  const exportCsv = () => {
    const headers = columns.map(titleCase)
    const records = filteredRows.map((row) => columns.map((column) => row[column] ?? ''))
    const csv = serializeCsv(headers, records)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `peoplepulse-${page}-${selectedMonth}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div className="planning-module">
      <div className="planning-intro"><p>{config.description}</p><small>Department and company filters apply when fields are present in staged rows. Location applies to contract manpower. Employment type does not apply.</small></div>
      {dataSource === 'demo' ? <Panel title={config.title} subtitle="No data available for Demo Data."><div className="chart-empty"><p>No synthetic {page === 'contracts' ? 'contract workforce' : page === 'budget' ? 'HR budget' : 'recruitment'} records are generated. Select Imported Data and stage this dataset to see its metrics.</p></div></Panel> : !rows.length ? <Panel title={config.title} subtitle={`No matching imported rows for ${selectedMonth}.`}><div className="chart-empty"><p>No staged records match this reporting month and filter selection. Adjust filters or import records for this period.</p></div></Panel> : <>
        {completionStatus(report, selectedMonth)}
        <div className={`metric-grid ${page === 'recruitment' ? 'five-metrics' : 'four-metrics'}`}>{config.metrics.map((item) => <MetricCard key={item.key} label={item.label} value={formatValue(metricValues[item.key], item)} detail={report.complete ? selectedMonth : 'Staged rows only'} tone={item.money ? 'violet' : 'blue'} icon={item.icon} />)}</div>
        {page === 'recruitment' && <p className="planning-definition">Open positions count approved minus filled positions for requisitions with status Open. Time to hire is requisition date to accepted-offer date; it is unavailable unless accepted offers have dates. Time to fill is requisition date to joining date.</p>}
        {page === 'contracts' && <p className="planning-definition">Total vendor cost = monthly gross + reported service charges + explicitly reported GST amount. No tax rate is inferred.</p>}
        {page === 'budget' && <p className="planning-definition">Variance = approved budget − actual. Payroll, Contract Manpower, and approved Increment actuals use matching complete monthly sources; Increment actual = approved annual CTC change ÷ 12. Recruitment and Other actuals are not available.</p>}
        {page === 'budget' && !report.dimensionFiltersSupported && <p className="planning-definition">Budget comparisons are unavailable with the selected location or employment-type filter because budget rows do not contain those dimensions.</p>}
        <Panel title={`${config.title} detail`} subtitle={`${filteredRows.length} rows for ${selectedMonth}`} className="planning-table-panel" action={<button type="button" className="export-button" onClick={exportCsv}><Download size={14} /> Export filtered CSV</button>}>
          <div className="table-toolbar"><div className="table-count"><b>{filteredRows.length}</b> records</div><label className="search-field"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search staged records..." aria-label="Search planning records" /></label></div>
          <div className="report-table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{titleCase(column)}</th>)}</tr></thead><tbody>{filteredRows.length ? filteredRows.map((row, index) => <tr key={`${page}-${index}`}>{columns.map((column) => {
            const value = row[column]
            const isMoney = page === 'contracts' ? /monthlyGross|vendorServiceCharges|monthlyGstAmount|totalMonthlyCost/.test(column) : page === 'budget' && ['budgetAmount', 'actual', 'variance'].includes(column)
            return <td key={column}>{value == null ? 'Unavailable' : isMoney ? formatINR(value) : value}</td>
          })}</tr>) : <tr><td colSpan={columns.length}>No staged rows for this month and filter selection.</td></tr>}</tbody></table></div>
        </Panel>
      </>}
    </div>
  )
}
