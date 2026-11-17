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

export default function Sidebar({ activePage, onNavigate, collapsed, onToggle, mobileOpen, onClose, availablePages }) {
  return (
    <>
      <button
        className={`sidebar-backdrop ${mobileOpen ? 'is-visible' : ''}`}
        aria-label="Close navigation"
        onClick={onClose}
      />
      <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><span>p</span></div>
          <div className="brand-copy">
            <strong>PeoplePulse</strong>
            <span>PEOPLE INTELLIGENCE</span>
          </div>
          <button className="mobile-close icon-button" onClick={onClose} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="workspace-switch">
          <div className="workspace-avatar">N</div>
          <div className="workspace-copy"><strong>Northstar Labs</strong><span>People team</span></div>
          <ChevronRight className="workspace-chevron" size={15} />
        </div>
        <nav className="side-nav" aria-label="Main navigation">
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
                    title={collapsed ? label : undefined}
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
          <div className="data-note"><span className="note-icon"><WalletCards size={16} /></span><span><strong>Demo workspace</strong><small>Synthetic data only</small></span></div>
          <button className="collapse-button" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
            <span>Collapse menu</span>
          </button>
        </div>
      </aside>
    </>
  )
}
