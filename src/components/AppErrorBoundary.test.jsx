// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import AppErrorBoundary from './AppErrorBoundary'

function BrokenDashboard() {
  throw new Error('Internal dashboard error')
}

it('offers reload when the dashboard throws during render', () => {
  render(<AppErrorBoundary><BrokenDashboard /></AppErrorBoundary>, { onCaughtError: () => {} })

  expect(screen.getByRole('alert').textContent).toContain('Unable to load the workspace')
  expect(screen.getByRole('button', { name: 'Reload workspace' })).toBeTruthy()
  expect(screen.queryByText('Internal dashboard error')).toBeNull()
})
