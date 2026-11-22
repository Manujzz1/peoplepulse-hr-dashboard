export const PAGE_PERMISSIONS = {
  executive: ['reports.aggregate'],
  workforce: ['employee.read'],
  employeeMaster: ['employee.read'],
  payroll: ['payroll.read', 'employee.read'],
  attendance: ['attendance.read', 'employee.read'],
  performance: ['performance.read', 'employee.read'],
  projects: ['projects.read', 'employee.read'],
  dataImport: ['imports.read', 'imports.write', 'employee.read'],
  dataQuality: ['imports.read'],
  reports: ['reports.aggregate'],
  recruitment: ['recruitment.read'],
  contracts: ['contracts.read'],
  budget: ['budget.read'],
}

export const REPORT_PERMISSIONS = {
  summary: ['reports.aggregate'],
  headcount: ['employee.read'],
  movements: ['employee.read'],
  trends: ['reports.aggregate'],
  payroll: ['payroll.read'],
  departments: ['payroll.read'],
  employeeCost: ['payroll.read', 'employee.read'],
  attendance: ['attendance.read', 'employee.read'],
  leaveLop: ['leave.read', 'employee.read'],
  performance: ['performance.read', 'employee.read'],
  increments: ['increments.read', 'employee.read'],
  projectAllocation: ['projects.read', 'employee.read', 'payroll.read'],
  projectCost: ['projects.read', 'payroll.read'],
  recruitment: ['recruitment.read'],
  contracts: ['contracts.read'],
  budget: ['budget.read'],
  consolidated: [
    'reports.aggregate', 'employee.read', 'payroll.read', 'attendance.read', 'leave.read',
    'performance.read', 'increments.read', 'projects.read', 'recruitment.read', 'contracts.read', 'budget.read',
  ],
}

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  hr_admin: 'HR Admin',
  hr_analyst: 'HR Analyst',
  management: 'Management',
  department_head: 'Department Head',
  payroll_specialist: 'Payroll Specialist',
}

export function deriveAccessProfile(roleRows = [], permissionRows = [], departments = []) {
  const roles = [...new Set(roleRows.map((row) => row.role_key).filter(Boolean))]
  const permissions = new Set(permissionRows.map((row) => row.permission_key).filter(Boolean))
  const isSuperAdmin = roles.includes('super_admin')
  if (isSuperAdmin) permissions.add('*')
  const departmentIds = new Set(roleRows.map((row) => row.department_id).filter(Boolean))
  const departmentNames = departments.filter((row) => departmentIds.has(row.id)).map((row) => row.department_name)
  const permissionDepartmentScopes = {}
  for (const permission of permissions) {
    if (permission === '*') continue
    const assignedRoles = roleRows.filter((roleRow) => permissionRows.some((permissionRow) =>
      permissionRow.role_key === roleRow.role_key && permissionRow.permission_key === permission,
    ))
    if (assignedRoles.some((roleRow) => !roleRow.department_id)) continue
    if (assignedRoles.length) {
      const scopeIds = new Set(assignedRoles.map((roleRow) => roleRow.department_id))
      permissionDepartmentScopes[permission] = departments
        .filter((department) => scopeIds.has(department.id))
        .map((department) => department.department_name)
    }
  }
  return {
    roles,
    scopeKey: JSON.stringify([
      roleRows.map(({ role_key, organization_id, company_id, department_id }) =>
        JSON.stringify([role_key, organization_id, company_id, department_id])).sort(),
      [...permissions].sort(),
      Object.entries(permissionDepartmentScopes).sort().map(([key, names]) => [key, [...names].sort()]),
    ]),
    roleLabel: roles.map((role) => ROLE_LABELS[role] || role).join(', '),
    permissions,
    isDepartmentScoped: Object.keys(permissionDepartmentScopes).length > 0,
    departmentNames,
    permissionDepartmentScopes,
  }
}

export function hasPermission(access, permission) {
  return Boolean(access?.permissions?.has('*') || access?.permissions?.has(permission))
}

export function canAccessPage(access, page) {
  const required = PAGE_PERMISSIONS[page]
  return Boolean(required && required.every((permission) => hasPermission(access, permission)))
}

export function getAllowedReportKeys(access) {
  return Object.entries(REPORT_PERMISSIONS)
    .filter(([, required]) => required.every((permission) => hasPermission(access, permission)))
    .map(([report]) => report)
}

export function getDepartmentScope(access, requiredPermissions = []) {
  if (!access || access.permissions?.has('*') || !requiredPermissions.length) return null
  const scopedPermissions = requiredPermissions
    .map((permission) => access.permissionDepartmentScopes?.[permission])
    .filter(Array.isArray)
  if (!scopedPermissions.length) return null
  return scopedPermissions.slice(1).reduce(
    (visible, scope) => visible.filter((department) => scope.includes(department)),
    [...scopedPermissions[0]],
  )
}

export async function loadAccessProfile(client, userId) {
  const { data: roleRows, error: roleError } = await client
    .from('user_roles')
    .select('role_key, organization_id, company_id, department_id')
    .eq('user_id', userId)
    .eq('active', true)
  if (roleError) throw roleError
  if (!roleRows?.length) return deriveAccessProfile()

  const roleKeys = [...new Set(roleRows.map((row) => row.role_key))].filter((role) => role !== 'super_admin')
  const departmentIds = [...new Set(roleRows.map((row) => row.department_id).filter(Boolean))]
  const [{ data: permissionRows, error: permissionError }, departmentResult] = await Promise.all([
    roleKeys.length
      ? client.from('role_permissions').select('role_key, permission_key').in('role_key', roleKeys)
      : Promise.resolve({ data: [], error: null }),
    departmentIds.length
      ? client.from('departments').select('id, department_name').in('id', departmentIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (permissionError) throw permissionError
  if (departmentResult.error) throw departmentResult.error
  return deriveAccessProfile(roleRows, permissionRows || [], departmentResult.data || [])
}

// Revalidate the current session before sensitive client-side actions such as
// generating a report file. This is defense in depth; database RLS remains the
// authorization boundary for any live data query.
export async function loadCurrentAccessProfile(client) {
  if (!client?.auth?.getUser) throw new Error('Authenticated Supabase client is unavailable')
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  if (!data?.user?.id || data.user.is_anonymous) return deriveAccessProfile()
  return { ...await loadAccessProfile(client, data.user.id), userId: data.user.id }
}
