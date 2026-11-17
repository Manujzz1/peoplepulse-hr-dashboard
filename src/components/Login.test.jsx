// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}))

vi.mock('../auth/supabaseClient', () => ({
  supabaseConfigured: true,
  supabaseConfigurationError: '',
  supabase: { auth: mockAuth },
}))

import Login from './Login'

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.signInWithPassword.mockResolvedValue({ data: { session: { user: { email: 'analyst@example.test' } } }, error: null })
  mockAuth.resetPasswordForEmail.mockResolvedValue({ error: null })
  mockAuth.updateUser.mockResolvedValue({ error: null })
})

describe('Login', () => {
  it('authenticates with the provider session and keeps demo mode as an explicit separate choice', async () => {
    const user = userEvent.setup()
    const onAuthenticated = vi.fn()
    const onDemoLogin = vi.fn()
    render(<Login onAuthenticated={onAuthenticated} onDemoLogin={onDemoLogin} />)
    await user.type(screen.getByLabelText('Email address'), 'analyst@example.test')
    await user.type(screen.getByLabelText('Password'), 'synthetic-password')
    await user.click(screen.getByRole('button', { name: 'Sign in securely' }))
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith({ user: { email: 'analyst@example.test' } }))
    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'analyst@example.test', password: 'synthetic-password' })
    await user.click(screen.getByRole('button', { name: /Continue to demo workspace/ }))
    expect(onDemoLogin).toHaveBeenCalledOnce()
  })

  it('shows provider errors and offers a non-enumerating reset confirmation', async () => {
    const user = userEvent.setup()
    mockAuth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: new Error('Invalid login credentials') })
    render(<Login onAuthenticated={vi.fn()} onDemoLogin={vi.fn()} />)
    await user.type(screen.getByLabelText('Email address'), 'unknown@example.test')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in securely' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Invalid login credentials')
    await user.click(screen.getByRole('button', { name: /Send password reset email/ }))
    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith('unknown@example.test', { redirectTo: window.location.origin })
    expect((await screen.findByRole('status')).textContent).toContain('If the account exists')
  })

  it('updates passwords only in the provider recovery flow', async () => {
    const user = userEvent.setup()
    const onRecoveryComplete = vi.fn()
    render(<Login recoveryMode onRecoveryComplete={onRecoveryComplete} />)
    await user.type(screen.getByLabelText('New password'), 'synthetic-new-password')
    fireEvent.submit(screen.getByRole('button', { name: 'Update password' }).closest('form'))
    await waitFor(() => expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'synthetic-new-password' }))
    expect(onRecoveryComplete).toHaveBeenCalledOnce()
  })
})
