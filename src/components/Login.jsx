import { useState } from 'react'
import { Activity, ArrowRight, KeyRound, LockKeyhole, Mail } from 'lucide-react'
import { supabase, supabaseConfigured, supabaseConfigurationError } from '../auth/supabaseClient'

export default function Login({ onDemoLogin, onAuthenticated, recoveryMode = false, onRecoveryComplete }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      if (recoveryMode) {
        const { error: updateError } = await supabase.auth.updateUser({ password })
        if (updateError) throw updateError
        setPassword('')
        setMessage('Password updated. Your authenticated session is ready.')
        onRecoveryComplete?.()
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (signInError) throw signInError
        onAuthenticated(data.session)
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication could not be completed.')
    } finally {
      setLoading(false)
    }
  }

  const requestReset = async () => {
    setError('')
    setMessage('')
    if (!email.trim()) {
      setError('Enter your account email address first.')
      return
    }
    setLoading(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
      if (resetError) throw resetError
      setMessage('If the account exists, a password reset email has been sent.')
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Password reset could not be requested.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-layout">
        <aside className="login-showcase" aria-label="PeoplePulse overview">
          <div className="login-brand login-brand-light"><span><Activity size={22} /></span><div><strong>PeoplePulse</strong><small>PEOPLE INTELLIGENCE</small></div></div>
          <div className="login-showcase-copy"><p>HR ANALYTICS WORKSPACE</p><h2>Make people data<br />clearer.</h2><span>One calm workspace for workforce, payroll, attendance, performance, and planning insights.</span></div>
          <div className="login-preview" aria-hidden="true">
            <div className="login-preview-header"><span>Workforce overview</span><i>Sample data</i></div>
            <div className="login-preview-stats"><div><small>Workforce</small><b>Analytics</b></div><div><small>Reporting</small><b>Monthly</b></div></div>
            <div className="login-preview-chart"><div className="login-preview-chart-label"><span>People trends</span><span>FYTD</span></div><div className="login-preview-bars">{[34, 48, 42, 63, 54, 76, 68, 91, 78, 100, 86, 96].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div></div>
          </div>
          <p className="login-showcase-foot">Fictional sample records only · no live employee data</p>
        </aside>
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-intro"><p className="login-eyebrow">{recoveryMode ? 'ACCOUNT RECOVERY' : 'WELCOME TO PEOPLEPULSE'}</p><h1 id="login-title">{recoveryMode ? 'Choose a new password' : 'Sign in to your workspace'}</h1><p>{recoveryMode ? 'Set a new password for your PeoplePulse account.' : supabaseConfigured ? 'Use your organisation account to continue.' : 'Enter the workspace with synthetic sample data.'}</p></div>
          {supabaseConfigured && <form className="login-form" onSubmit={submit}>
            {!recoveryMode && <label>Email address<span className="login-input"><Mail size={16} /><input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></span></label>}
            <label>{recoveryMode ? 'New password' : 'Password'}<span className="login-input"><LockKeyhole size={16} /><input type="password" autoComplete={recoveryMode ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={recoveryMode ? 'At least 8 characters' : 'Enter your password'} /></span></label>
            {error && <p className="login-error" role="alert">{error}</p>}
            {message && <p className="login-success" role="status">{message}</p>}
            <button className="login-submit" type="submit" disabled={loading}>{loading ? 'Please wait…' : recoveryMode ? 'Update password' : 'Sign in securely'} <ArrowRight size={16} /></button>
            {!recoveryMode && <button className="login-secondary" type="button" disabled={loading} onClick={requestReset}><KeyRound size={14} /> Send password reset email</button>}
          </form>}
          {error && !supabaseConfigured && <p className="login-error" role="alert">{error}</p>}
          {message && !supabaseConfigured && <p className="login-success" role="status">{message}</p>}
          {!recoveryMode && <div className="demo-mode-card"><div className="demo-mode-heading"><span><Activity size={16} /></span><strong>Synthetic demo access</strong></div><span>This opens fictional sample data. It does not sign in to an organisation account or protect real HR information.</span><button type="button" className="login-submit" onClick={onDemoLogin}>Continue to demo workspace <ArrowRight size={16} /></button></div>}
          {!supabaseConfigured && <div className="login-setup-note"><LockKeyhole size={15} /><p><b>Organisation sign-in isn’t connected</b><span>{supabaseConfigurationError || 'No account credentials are configured for this site. An administrator must connect Supabase Auth and provision your account.'}</span></p></div>}
          {supabaseConfigured && <p className="login-security-note">Organisation sign-in uses Supabase Auth. Access to real HR data also requires approved server-side database policies.</p>}
        </section>
      </div>
    </main>
  )
}
