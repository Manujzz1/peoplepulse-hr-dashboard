import { describe, expect, it, vi } from 'vitest'
import { readTenantResource } from './tenantReads'

function mockClient({ user = { id: 'synthetic-user' }, authError = null, queryError = null, rows = [] } = {}) {
  const select = vi.fn().mockResolvedValue({ data: rows, error: queryError })
  const from = vi.fn(() => ({ select }))
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: authError })
  return { client: { auth: { getUser }, from }, getUser, from, select }
}

describe('readTenantResource', () => {
  it('verifies the current user and lets RLS scope an allowlisted employee read', async () => {
    const rows = [{ employee_code: 'SYN-EMP-01' }]
    const mock = mockClient({ rows })

    await expect(readTenantResource(mock.client, 'employees')).resolves.toEqual(rows)
    expect(mock.getUser).toHaveBeenCalledOnce()
    expect(mock.from).toHaveBeenCalledWith('employees')
    expect(mock.select).toHaveBeenCalledWith('id, company_id, employee_code, employee_name, department_id, location_id, designation, grade, employment_type, hire_date, exit_date')
  })

  it('does not query protected tables when there is no authenticated user', async () => {
    const mock = mockClient({ user: null })

    await expect(readTenantResource(mock.client, 'payroll')).rejects.toThrow('Sign in before reading organization data')
    expect(mock.from).not.toHaveBeenCalled()
  })

  it('propagates Auth and RLS query errors', async () => {
    const authError = new Error('session verification failed')
    const unauthenticated = mockClient({ authError })
    await expect(readTenantResource(unauthenticated.client, 'companies')).rejects.toBe(authError)
    expect(unauthenticated.from).not.toHaveBeenCalled()

    const rlsError = new Error('row access denied')
    const denied = mockClient({ queryError: rlsError })
    await expect(readTenantResource(denied.client, 'payroll')).rejects.toBe(rlsError)
  })

  it('rejects unknown resources before issuing a request', async () => {
    const mock = mockClient()
    await expect(readTenantResource(mock.client, 'auth.users')).rejects.toThrow('Unsupported tenant resource')
    expect(mock.getUser).not.toHaveBeenCalled()
    expect(mock.from).not.toHaveBeenCalled()
  })
})
