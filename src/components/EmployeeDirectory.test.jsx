/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import EmployeeDirectory from './EmployeeDirectory'

afterEach(cleanup)

describe('Employee Directory effective history', () => {
  it('shows current attributes and effective-dated workforce changes in the employee profile', () => {
    render(<EmployeeDirectory
      asOfDate="2025-03-31"
      sourceLabel="Imported Data"
      rosterComplete
      employees={[{
        id: 'SYN-EMP-01', employeeId: 'SYN-EMP-01', name: 'Synthetic Analyst', employeeName: 'Synthetic Analyst',
        department: 'Sales', designation: 'Senior Analyst', grade: 'G2', location: 'Mumbai', employmentType: 'Permanent',
        managerEmployeeId: 'SYN-MGR-01', costCentre: 'SYN-CC-01', hireDate: '2024-01-15', status: 'Active',
        effectiveHistory: [{ effectiveFrom: '2025-03-01', effectiveTo: '', department: 'Sales', location: 'Mumbai', designation: 'Senior Analyst', grade: 'G2' }],
      }]}
    />)

    expect(screen.getByText('G2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Synthetic Analyst' }))
    expect(screen.getByRole('dialog', { name: 'Synthetic Analyst' })).toBeTruthy()
    expect(screen.getByText('Manager employee ID')).toBeTruthy()
    expect(screen.getByText(/Workforce attributes effective · Department: Sales · Location: Mumbai · Designation: Senior Analyst · Grade: G2/)).toBeTruthy()
  })
})
