import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import AppErrorBoundary from './components/AppErrorBoundary'
import ExecutiveSamplePreview from './components/ExecutiveSamplePreview'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <main className="standalone-executive">
        <header className="standalone-executive-header">
          <span className="brand-mark" aria-hidden="true"><span>p</span></span>
          <div><strong>PeoplePulse</strong><h1>Executive dashboard</h1></div>
        </header>
        <div className="page-content"><ExecutiveSamplePreview /></div>
      </main>
    </AppErrorBoundary>
  </StrictMode>,
)
