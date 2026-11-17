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
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand"><span><Activity size={22} /></span><div><strong>PeoplePulse</strong><small>PEOPLE INTELLIGENCE</small></div></div>
        <div className="login-intro"><p className="login-eyebrow">HR ANALYTICS WORKSPACE</p><h1 id="login-title">{recoveryMode ? 'Choose a new password' : 'Welcome back'}</h1><p>{recoveryMode ? 'Set a new password for your PeoplePulse account.' : supabaseConfigured ? 'Sign in with your organisation account, or explore synthetic demo data.' : 'Explore the dashboard with synthetic demo data.'}</p></div>
        {supabaseConfigured && <form className="login-form" onSubmit={submit}>
          {!recoveryMode && <label>Email address<span className="login-input"><Mail size={16} /><input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></span></label>}
          <label>{recoveryMode ? 'New password' : 'Password'}<span className="login-input"><LockKeyhole size={16} /><input type="password" autoComplete={recoveryMode ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={recoveryMode ? 'At least 8 characters' : 'Enter your password'} /></span></label>
          {error && <p className="login-error" role="alert">{error}</p>}
          {message && <p className="login-success" role="status">{message}</p>}
          <button className="login-submit" type="submit" disabled={loading}>{loading ? 'Please wait…' : recoveryMode ? 'Update password' : 'Sign in'} <ArrowRight size={16} /></button>
          {!recoveryMode && <button className="login-secondary" type="button" disabled={loading} onClick={requestReset}><KeyRound size={14} /> Send password reset email</button>}
        </form>}
        {error && !supabaseConfigured && <p className="login-error" role="alert">{error}</p>}
        {message && !supabaseConfigured && <p className="login-success" role="status">{message}</p>}
        {!recoveryMode && <div className="demo-mode-card"><strong>Synthetic demo mode</strong><span>No account is required. This mode uses fictional sample records and does not authenticate access to real HR data.</span><button type="button" className="login-submit" onClick={onDemoLogin}>Continue to synthetic demo <ArrowRight size={16} /></button></div>}
        {!supabaseConfigured && <p className="login-security-note">{supabaseConfigurationError || 'Organisation sign-in is not configured. Add the Supabase URL and public anon key to a local environment file to enable it.'}</p>}
        {supabaseConfigured && <p className="login-security-note">Organisation accounts use Supabase Auth. Database access remains subject to server-side policies; demo mode has no access to authenticated accounts.</p>}
      </section>
    </main>
  )
}
