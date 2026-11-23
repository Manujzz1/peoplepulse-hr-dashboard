import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  LayoutDashboard,
  FileUp,
  FileText,
  ContactRound,
  ClipboardCheck,
  UserRoundPlus,
  HandCoins,
  Scale,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react'

const navigation = [
  { section: 'OVERVIEW', items: [{ id: 'executive', label: 'Executive dashboard', icon: LayoutDashboard }] },
  {
    section: 'ANALYTICS',
    items: [
      { id: 'workforce', label: 'Workforce', icon: UsersRound },
      { id: 'employeeMaster', label: 'Employee Master', icon: ContactRound },
      { id: 'payroll', label: 'Payroll & CTC', icon: CircleDollarSign },
      { id: 'attendance', label: 'Attendance & leave', icon: Activity },
      { id: 'performance', label: 'Performance', icon: BarChart3 },
      { id: 'projects', label: 'Project allocation', icon: BriefcaseBusiness },
    ],
  },
  { section: 'DATA', items: [
    { id: 'dataImport', label: 'Data Import', icon: FileUp },
    { id: 'dataQuality', label: 'Data Quality', icon: ClipboardCheck },
  ] },
  { section: 'REPORTING', items: [{ id: 'reports', label: 'Reports Centre', icon: FileText }] },
  { section: 'PLANNING', items: [
    { id: 'recruitment', label: 'Recruitment', icon: UserRoundPlus },
    { id: 'contracts', label: 'Contract manpower', icon: HandCoins },
    { id: 'budget', label: 'HR budget', icon: Scale },
  ] },
]

export default function Sidebar({ activePage, onNavigate, collapsed, onToggle, mobileOpen, onClose, availablePages, workspaceName = 'Organisation workspace', organization, organizationOptions, onOrganizationChange }) {
  const [tooltip, setTooltip] = useState(null)
  const closeButton = useRef(null)
  useEffect(() => { if (mobileOpen) closeButton.current?.focus() }, [mobileOpen])
  const showTooltip = (button, label) => {
    if (!collapsed || mobileOpen) return
    const { right, top, height } = button.getBoundingClientRect()
    setTooltip({ label, left: right + 8, top: top + height / 2 })
  }
  const refreshFocusedTooltip = (event) => {
    const focused = document.activeElement
    if (event.currentTarget.contains(focused) && focused.matches('.nav-item:focus-visible')) {
      showTooltip(focused, focused.getAttribute('aria-label'))
    } else setTooltip(null)
  }
  return (
    <>
      <button
        className={`sidebar-backdrop ${mobileOpen ? 'is-visible' : ''}`}
        aria-label="Close navigation"
        onClick={onClose}
      />
      <aside id="workspace-sidebar" className={`sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-open' : ''}`}
        onKeyDown={(event) => { if (mobileOpen && event.key === 'Escape') onClose() }}>
        <div className="brand-row">
          <div className="brand-mark"><span>p</span></div>
          <div className="brand-copy">
            <strong>PeoplePulse</strong>
            <span>PEOPLE INTELLIGENCE</span>
          </div>
          <button ref={closeButton} className="mobile-close icon-button" onClick={onClose} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="workspace-switch">
          <div className="workspace-avatar">{workspaceName.slice(0, 1).toUpperCase()}</div>
          <div className="workspace-copy"><strong title={workspaceName}>{workspaceName}</strong><span>HR Analytics</span></div>
          <ChevronRight className="workspace-chevron" size={15} />
        </div>
        {organizationOptions && <label className="sidebar-organization">
          <span>Organisation</span>
          <select aria-label="Sidebar organisation" value={organization} onChange={(event) => onOrganizationChange(event.target.value)}>
            {organizationOptions.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>}
        <nav className="side-nav" aria-label="Main navigation" onScroll={refreshFocusedTooltip}>
          {navigation.map((group) => {
            const items = availablePages ? group.items.filter((item) => availablePages.includes(item.id)) : group.items
            if (!items.length) return null
            return (
              <div className="nav-group" key={group.section}>
                <p className="nav-heading">{group.section}</p>
                {items.map(({ id, label, icon: Icon }) => (
                  <button
                    className={`nav-item ${activePage === id ? 'active' : ''}`}
                    key={id}
                    onClick={() => { onNavigate(id); onClose() }}
                    onMouseEnter={(event) => showTooltip(event.currentTarget, label)}
                    onMouseLeave={(event) => { if (!event.currentTarget.matches(':focus-visible')) setTooltip(null) }}
                    onFocus={(event) => showTooltip(event.currentTarget, label)}
                    onBlur={() => setTooltip(null)}
                    aria-label={label}
                    aria-current={activePage === id ? 'page' : undefined}
                  >
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{label}</span>
                    {id === 'executive' && <span className="nav-live-dot" />}
                  </button>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="data-note"><span className="note-icon"><WalletCards size={16} /></span><span><strong>Organisation workspace</strong><small>Access is role scoped</small></span></div>
          <button type="button" className="collapse-button" onClick={() => { setTooltip(null); onToggle() }}
            aria-expanded={!collapsed} aria-controls="workspace-sidebar" aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}>
            {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
            <span>{collapsed ? 'Expand menu' : 'Collapse menu'}</span>
          </button>
        </div>
      </aside>
      {collapsed && tooltip && <span className="sidebar-nav-tooltip" aria-hidden="true" style={{ left: tooltip.left, top: tooltip.top }}>{tooltip.label}</span>}
    </>
  )
}
