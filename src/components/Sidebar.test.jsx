// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'

describe('role-filtered navigation', () => {
  it('renders only the pages granted to the authenticated role', () => {
    render(<Sidebar
      activePage="executive"
      onNavigate={vi.fn()}
      collapsed={false}
      onToggle={vi.fn()}
      mobileOpen={false}
      onClose={vi.fn()}
      availablePages={['executive', 'reports']}
    />)

    const navigation = within(screen.getByRole('navigation', { name: 'Main navigation' }))
    expect(navigation.getByRole('button', { name: 'Executive dashboard' })).toBeTruthy()
    expect(navigation.getByRole('button', { name: 'Reports Centre' })).toBeTruthy()
    expect(navigation.queryByRole('button', { name: 'Payroll & CTC' })).toBeNull()
    expect(navigation.queryByRole('button', { name: 'Data Import' })).toBeNull()
  })
})
