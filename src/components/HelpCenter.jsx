import { useEffect, useRef, useState } from 'react'
import { CircleHelp, X } from 'lucide-react'

export default function HelpCenter({ onNavigate }) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
    return undefined
  }, [open])

  const openDefinitions = () => {
    setOpen(false)
    onNavigate('executive')
    globalThis.setTimeout(() => {
      const definitions = document.querySelector('.kpi-definitions')
      if (definitions) {
        definitions.open = true
        definitions.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)
  }

  return (
    <>
      <button type="button" className="help-button" aria-label="Open PeoplePulse help" onClick={() => setOpen(true)}><CircleHelp size={15} /><span>Help</span></button>
      <dialog ref={dialogRef} className="help-dialog" aria-labelledby="help-title" onCancel={(event) => { event.preventDefault(); setOpen(false) }} onClick={(event) => { if (event.target === dialogRef.current) setOpen(false) }}>
        <header><div><span className="eyebrow">PEOPLEPULSE SUPPORT</span><h2 id="help-title">Dashboard help</h2></div><button type="button" className="icon-button" aria-label="Close help" onClick={() => setOpen(false)}><X size={18} /></button></header>
        <div className="help-content">
          <section><h3>Periods and filters</h3><p>Choose a reporting month and as-of date, set the reporting-year start month (April by default), then apply company, department, location, or employment-type filters. Relevant charts, tables, KPIs, and exports use the active selection. Use <b>Reset filters</b> to return to the default period, April start, and organisation scope.</p></section>
          <section><h3>Imported data</h3><p>CSV and XLSX files are parsed and validated in this browser. Staging is in memory, separate from Demo Data, and does not upload or persist the file. Imported analytics remain unavailable until the required source completeness and employee/project reference checks pass.</p><button type="button" className="help-link-button" onClick={() => { setOpen(false); onNavigate('dataImport') }}>Open Data Import</button></section>
          <section><h3>Reports and definitions</h3><p>The Reports Centre uses the active filters for CSV, Excel, and PDF output. The Executive Dashboard contains the KPI formulas and notes about data completeness.</p><button type="button" className="help-link-button" onClick={openDefinitions}>View KPI definitions</button></section>
        </div>
      </dialog>
    </>
  )
}
