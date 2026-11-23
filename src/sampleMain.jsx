import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BarChart3, ClipboardList, LayoutDashboard, Lightbulb, LogOut, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import './index.css'
import './App.css'
import AppErrorBoundary from './components/AppErrorBoundary'
import ExecutiveSamplePreview from './components/ExecutiveSamplePreview'
import BrowserImportPreview from './components/BrowserImportPreview'

import Login from './components/Login'
import { supabase } from './auth/supabaseClient'

const originalSite = 'https://peoplepulse-hr-dashboard.vercel.app'
const sections = [
  ['executive-sample-preview', 'Executive dashboard', LayoutDashboard],
  ['sample-workforce', 'Workforce analytics', BarChart3],
  ['sample-checklist', 'HR Checklist', ClipboardList],
  ['sample-insights', 'Management Insights', Lightbulb],
  ['browser-import-preview', 'Upload preview', ClipboardList],
]

export function SampleSite() {
  const [session, setSession] = useState(undefined)
  const [signOutError, setSignOutError] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!supabase) return undefined
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    setSignOutError('')
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) {
      setSignOutError('Sign-out could not be completed. Try again.')
      return
    }
    setMobileOpen(false)
  }

  if (supabase && session === undefined) return <main className="sample-login"><p role="status">Checking your PeoplePulse session…</p></main>
  if (!session) return <Login onAuthenticated={setSession} passwordResetUrl={originalSite} />

  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose
  return <div className="standalone-executive sample-shell" data-collapsed={collapsed} data-menu-open={mobileOpen}>
    {mobileOpen && <button className="sample-backdrop" type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
    <aside id="sample-navigation" className="sample-navigation">
      <div className="sample-nav-brand"><span className="brand-mark" aria-hidden="true"><span>p</span></span><strong>PeoplePulse</strong></div>
      <nav aria-label="Executive dashboard menu">
        {sections.map(([id, label, Icon]) => <a href={'#' + id} key={id} aria-label={label} title={label} onClick={() => setMobileOpen(false)}>
          <Icon size={18} aria-hidden="true" /><span>{label}</span>
        </a>)}
      </nav>
      <button className="sample-collapse" type="button" aria-controls="sample-navigation" aria-expanded={!collapsed} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
        title={collapsed ? 'Expand menu' : 'Collapse menu'} onClick={() => setCollapsed(!collapsed)}>
        <CollapseIcon size={18} aria-hidden="true" /><span>{collapsed ? 'Expand menu' : 'Collapse menu'}</span>
      </button>
    </aside>
    <main className="sample-main">
      <header className="standalone-executive-header">
        <button type="button" className="sample-menu-toggle" aria-label={mobileOpen ? 'Close navigation' : 'Open menu'} aria-expanded={mobileOpen}
          aria-controls="sample-navigation" onClick={() => setMobileOpen(!mobileOpen)}><Menu size={21} aria-hidden="true" /></button>
        <h1>Executive dashboard</h1>
        <button className="sample-logout" type="button" onClick={signOut}><LogOut size={16} aria-hidden="true" /> Sign out</button>
      </header>
      {signOutError && <p role="alert">{signOutError}</p>}
      <div className="page-content"><ExecutiveSamplePreview /><BrowserImportPreview /></div>
    </main>
  </div>
}

createRoot(document.getElementById('root')).render(<StrictMode><AppErrorBoundary><SampleSite /></AppErrorBoundary></StrictMode>)
