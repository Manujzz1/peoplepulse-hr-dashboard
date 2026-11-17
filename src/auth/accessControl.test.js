import { describe, expect, it } from 'vitest'
import { canAccessPage, deriveAccessProfile, getAllowedReportKeys, getDepartmentScope, hasPermission, loadAccessProfile } from './accessControl'

const queryFor = (response) => ({
  select() { return this },
  eq() { return this },
  in() { return this },
  then(resolve, reject) { return Promise.resolve(response).then(resolve, reject) },
})

describe('role-based application access', () => {
  it('limits Management to aggregate pages and hides employee-level reports', () => {
    const access = deriveAccessProfile([{ role_key: 'management', department_id: null }], [
      { role_key: 'management', permission_key: 'reports.aggregate' },
    ])

    expect(canAccessPage(access, 'executive')).toBe(true)
    expect(canAccessPage(access, 'reports')).toBe(true)
    expect(canAccessPage(access, 'payroll')).toBe(false)
    expect(canAccessPage(access, 'dataImport')).toBe(false)
    expect(canAccessPage(access, 'dataQuality')).toBe(false)
    expect(getAllowedReportKeys(access)).toEqual(['summary', 'trends'])
    expect(getAllowedReportKeys(access)).not.toContain('headcount')
    expect(getAllowedReportKeys(access)).not.toContain('employeeCost')
  })

  it('allows report details only when all required permissions are present', () => {
    const access = deriveAccessProfile([{ role_key: 'payroll_specialist', department_id: null }], [
      { role_key: 'payroll_specialist', permission_key: 'reports.aggregate' },
      { role_key: 'payroll_specialist', permission_key: 'payroll.read' },
      { role_key: 'payroll_specialist', permission_key: 'employee.read' },
    ])

    expect(canAccessPage(access, 'payroll')).toBe(true)
    expect(getAllowedReportKeys(access)).toContain('employeeCost')
    expect(getAllowedReportKeys(access)).not.toContain('consolidated')
    expect(hasPermission(access, 'imports.write')).toBe(false)
  })

  it('requires payroll permission before exposing project salary and cost reports', () => {
    const projectAnalyst = deriveAccessProfile([{ role_key: 'hr_analyst', department_id: null }], [
      { role_key: 'hr_analyst', permission_key: 'projects.read' },
      { role_key: 'hr_analyst', permission_key: 'employee.read' },
    ])
    const payrollProjectAnalyst = deriveAccessProfile([{ role_key: 'hr_analyst', department_id: null }], [
      { role_key: 'hr_analyst', permission_key: 'projects.read' },
      { role_key: 'hr_analyst', permission_key: 'employee.read' },
      { role_key: 'hr_analyst', permission_key: 'payroll.read' },
    ])

    expect(canAccessPage(projectAnalyst, 'projects')).toBe(true)
    expect(getAllowedReportKeys(projectAnalyst)).not.toContain('projectAllocation')
    expect(getAllowedReportKeys(projectAnalyst)).not.toContain('projectCost')
    expect(getAllowedReportKeys(payrollProjectAnalyst)).toContain('projectAllocation')
    expect(getAllowedReportKeys(payrollProjectAnalyst)).toContain('projectCost')
  })

  it('allows the Data Quality dashboard only with import-read access', () => {
    const analyst = deriveAccessProfile([{ role_key: 'hr_analyst', department_id: null }], [
      { role_key: 'hr_analyst', permission_key: 'imports.read' },
    ])
    expect(canAccessPage(analyst, 'dataQuality')).toBe(true)
    expect(canAccessPage(analyst, 'dataImport')).toBe(false)
  })

  it('lets attendance-only users open attendance while keeping leave reports restricted', () => {
    const attendanceAnalyst = deriveAccessProfile([{ role_key: 'hr_analyst', department_id: null }], [
      { role_key: 'hr_analyst', permission_key: 'attendance.read' },
      { role_key: 'hr_analyst', permission_key: 'employee.read' },
    ])

    expect(canAccessPage(attendanceAnalyst, 'attendance')).toBe(true)
    expect(getAllowedReportKeys(attendanceAnalyst)).toContain('attendance')
    expect(getAllowedReportKeys(attendanceAnalyst)).not.toContain('leaveLop')
  })

  it('applies assigned department scope and grants Super Admin explicit full access', () => {
    const departmentHead = deriveAccessProfile(
      [{ role_key: 'department_head', department_id: 'dept-1' }],
      [{ role_key: 'department_head', permission_key: 'employee.read' }],
      [{ id: 'dept-1', department_name: 'Engineering' }, { id: 'dept-2', department_name: 'Finance' }],
    )
    const superAdmin = deriveAccessProfile([{ role_key: 'super_admin', department_id: null }])

    expect(departmentHead.isDepartmentScoped).toBe(true)
    expect(departmentHead.departmentNames).toEqual(['Engineering'])
    expect(getDepartmentScope(departmentHead, ['employee.read'])).toEqual(['Engineering'])
    expect(superAdmin.isDepartmentScoped).toBe(false)
    expect(canAccessPage(superAdmin, 'dataImport')).toBe(true)
    expect(getAllowedReportKeys(superAdmin)).toHaveLength(17)
  })

  it('keeps department-scoped data restricted even if another role grants company-wide aggregate access', () => {
    const access = deriveAccessProfile([
      { role_key: 'management', department_id: null },
      { role_key: 'department_head', department_id: 'dept-1' },
    ], [
      { role_key: 'management', permission_key: 'reports.aggregate' },
      { role_key: 'department_head', permission_key: 'reports.aggregate' },
      { role_key: 'department_head', permission_key: 'employee.read' },
    ], [{ id: 'dept-1', department_name: 'Engineering' }])

    expect(getDepartmentScope(access, ['reports.aggregate'])).toBeNull()
    expect(getDepartmentScope(access, ['employee.read'])).toEqual(['Engineering'])
  })

  it('denies all application pages if the account has no active role', () => {
    const access = deriveAccessProfile()

    expect(access.roles).toEqual([])
    expect(getAllowedReportKeys(access)).toEqual([])
    expect(canAccessPage(access, 'executive')).toBe(false)
  })

  it('loads roles and permissions from the authenticated client without persisting them', async () => {
    const rowsByTable = {
      user_roles: { data: [
        { role_key: 'management', department_id: null },
        { role_key: 'department_head', department_id: 'dept-1' },
      ], error: null },
      role_permissions: { data: [
        { role_key: 'management', permission_key: 'reports.aggregate' },
        { role_key: 'department_head', permission_key: 'employee.read' },
      ], error: null },
      departments: { data: [{ id: 'dept-1', department_name: 'Engineering' }], error: null },
    }
    const client = { from: (table) => queryFor(rowsByTable[table]) }

    const access = await loadAccessProfile(client, 'user-1')

    expect(access.roles).toEqual(['management', 'department_head'])
    expect(getDepartmentScope(access, ['employee.read'])).toEqual(['Engineering'])
    expect(canAccessPage(access, 'dataImport')).toBe(false)
  })

  it('fails closed when role lookup is unavailable', async () => {
    const client = { from: () => queryFor({ data: null, error: new Error('permission denied') }) }

    await expect(loadAccessProfile(client, 'user-1')).rejects.toThrow('permission denied')
  })
})
