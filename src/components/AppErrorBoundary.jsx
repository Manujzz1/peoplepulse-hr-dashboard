import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children

    return <main className="login-page">
      <section className="login-card" aria-labelledby="workspace-error">
        <div className="login-intro" role="alert">
          <p className="login-eyebrow">PEOPLEPULSE</p>
          <h1 id="workspace-error">Unable to load the workspace</h1>
          <p>Reload PeoplePulse to try again. If the problem continues, contact your administrator.</p>
        </div>
        <button className="login-submit" type="button" onClick={() => window.location.reload()}>Reload workspace</button>
      </section>
    </main>
  }
}
