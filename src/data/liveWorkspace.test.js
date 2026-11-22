import { describe, expect, it, vi } from 'vitest'
import { LiveWorkspaceError, loadLiveWorkspace, scopedLiveStages } from './liveWorkspace'
import { createHrModel } from './hrModel'

function makeClient({ tables = {}, user = { id: 'synthetic-user', is_anonymous: false }, authError = null, errors = {} } = {}) {
  const from = vi.fn((table) => {
    const state = { table, filters: [] }
    const query = {
      select: () => query,
      eq: (column, value) => { state.filters.push(['eq', column, value]); return query },
      in: (column, value) => { state.filters.push(['in', column, value]); return query },
      order: () => query,
      range: (from, to) => { state.range = [from, to]; return query },
      then: (resolve, reject) => Promise.resolve({ data: tables[table] || [], error: errors[table] || null }).then(resolve, reject),
    }
    return query
  })
  return {
    client: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: authError }) }, from },
    from,
  }
}

describe('loadLiveWorkspace', () => {
  it('requires a verified non-anonymous session and an active database role', async () => {
    const noSession = makeClient({ user: null })
    await expect(loadLiveWorkspace(noSession.client, { permissions: new Set(['*']) }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(noSession.from).not.toHaveBeenCalled()

    const noRole = makeClient({ tables: { user_roles: [] } })
    await expect(loadLiveWorkspace(noRole.client, { permissions: new Set(['*']) }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('reports an authorized but uninitialized organization as empty without substituting demo rows', async () => {
    const mock = makeClient({ tables: {
      organizations: [{ id: 'org-a', organization_name: 'Synthetic Org' }],
      user_roles: [{ organization_id: 'org-a', role_key: 'super_admin', active: true }],
      companies: [],
    } })
    const result = await loadLiveWorkspace(mock.client, { permissions: new Set(['*']) })

    expect(result.authorized).toBe(true)
    expect(result.empty).toBe(true)
    expect(result.companies).toEqual([])
    expect(result.stagedImports.employeeMaster.rows).toEqual([])
  })

  it('maps RLS-returned company and employee rows into the existing dashboard model shape', async () => {
    const mock = makeClient({ tables: {
      organizations: [{ id: 'org-a', organization_name: 'Synthetic Org' }],
      user_roles: [{ organization_id: 'org-a', role_key: 'hr_admin', active: true }],
      companies: [{ id: 'company-a', organization_id: 'org-a', company_name: 'Synthetic Company' }],
      departments: [{ id: 'dept-a', company_id: 'company-a', department_name: 'Synthetic Engineering', department_key: 'ENG' }],
      locations: [{ id: 'loc-a', company_id: 'company-a', location_name: 'Synthetic Pune', location_key: 'PUN' }],
      employees: [{ id: 'employee-a', company_id: 'company-a', employee_code: 'SYN-01', employee_name: 'Synthetic Person', department_id: 'dept-a', location_id: 'loc-a', hire_date: '2025-01-01' }],
    } })
    const result = await loadLiveWorkspace(mock.client, { permissions: new Set(['employee.read']) })

    expect(result.stagedImports.employeeMaster.rows).toEqual([expect.objectContaining({
      employeeId: 'SYN-01', employeeName: 'Synthetic Person', company: 'Synthetic Company',
      department: 'Synthetic Engineering', location: 'Synthetic Pune',
    })])
    expect(mock.from.mock.calls.map(([table]) => table)).toContain('employees')
  })

  it('fails the live load on a database error rather than returning demo content', async () => {
    const mock = makeClient({ tables: {
      organizations: [{ id: 'org-a' }],
      user_roles: [{ organization_id: 'org-a', role_key: 'hr_admin', active: true }],
      companies: [{ id: 'company-a', organization_id: 'org-a', company_name: 'Synthetic Company' }],
    }, errors: { employees: { message: 'RLS denied' } } })

    await expect(loadLiveWorkspace(mock.client, { permissions: new Set(['employee.read']) }))
      .rejects.toBeInstanceOf(LiveWorkspaceError)
    await expect(loadLiveWorkspace(mock.client, { permissions: new Set(['employee.read']) }))
      .rejects.toMatchObject({ code: 'QUERY_FAILED' })
  })

  it('keeps company-local codes and completeness attached to their own records', async () => {
    const mock = makeClient({ tables: {
      organizations: [{ id: 'org-a', organization_name: 'Synthetic Org' }],
      user_roles: [{ organization_id: 'org-a', role_key: 'super_admin', active: true }],
      companies: ['a', 'b'].map((id) => ({ id, organization_id: 'org-a', company_name: id })),
      employees: ['a', 'b'].map((id) => ({ id: `employee-${id}`, company_id: id, employee_code: 'SYN-01', hire_date: '2025-01-01' })),
      payroll_records: [{ company_id: 'b', employee_id: 'employee-b', reporting_month: '2025-04-01', monthly_gross: 100 }],
      import_batches: [
        { company_id: 'a', dataset_type: 'payroll', status: 'Published', reporting_month: '2025-04-01', metadata: { complete: true } },
        { company_id: 'b', dataset_type: 'payroll', status: 'Validated', reporting_month: '2025-04-01', metadata: { complete: true } },
      ],
    } })
    const result = await loadLiveWorkspace(mock.client, { permissions: new Set(['*']) })
    const aggregate = createHrModel(result.stagedImports)
    expect(aggregate.employees.size).toBe(2)
    expect(aggregate.unmatchedEmployees).toEqual([])
    expect(aggregate.completeness.payroll.size).toBe(0)
    expect(scopedLiveStages(result, 'Synthetic Org', 'a').payroll.completeMonths).toEqual(['2025-04'])
    expect(scopedLiveStages(result, 'Synthetic Org', 'b').payroll.completeMonths).toEqual([])
  })
})
