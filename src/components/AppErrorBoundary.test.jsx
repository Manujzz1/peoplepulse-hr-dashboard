// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import AppErrorBoundary from './AppErrorBoundary'

afterEach(cleanup)

function BrokenDashboard() {
  throw new Error('Internal dashboard error')
}

it('offers reload when the dashboard throws during render', () => {
  render(<AppErrorBoundary><BrokenDashboard /></AppErrorBoundary>, { onCaughtError: () => {} })

  expect(screen.getByRole('alert').textContent).toContain('Unable to load the workspace')
  expect(screen.getByRole('button', { name: 'Reload workspace' })).toBeTruthy()
  expect(screen.queryByText('Internal dashboard error')).toBeNull()
})

it('keeps navigation available after a module fails and clears the error on navigation', () => {
  const workspace = (page, content) => <>
    <nav>Workspace navigation</nav>
    <AppErrorBoundary key={page} moduleTitle={page}>{content}</AppErrorBoundary>
  </>
  const { rerender } = render(workspace('Workforce', <BrokenDashboard />), { onCaughtError: () => {} })
  expect(screen.getByRole('navigation').textContent).toBe('Workspace navigation')
  expect(screen.getByRole('heading', { name: 'Unable to load Workforce' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()

  rerender(workspace('Executive dashboard', <h2>Period comparisons</h2>))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Period comparisons' })).toBeTruthy()
})
