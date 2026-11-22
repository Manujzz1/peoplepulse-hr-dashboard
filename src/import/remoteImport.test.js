import { describe, expect, it, vi } from 'vitest'
import { submitImportBatch } from './remoteImport'

function makeClient({ user = { id: 'synthetic-user' }, authError = null, batch = null, lookupError = null, rpcData = null, rpcError = null } = {}) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: batch, error: lookupError }),
  }
  const rpc = vi.fn().mockResolvedValue({
    data: rpcData || { batchId: 'synthetic-batch', status: 'Validated', totalRows: 1, reportingMonth: null, reused: false },
    error: rpcError,
  })
  const from = vi.fn(() => query)
  return { client: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: authError }) }, from, rpc }, from, query, rpc }
}

const stage = {
  fileName: 'synthetic-departments.csv', sheetName: 'Departments', rows: [{ departmentId: 'ENG', department: 'Engineering' }],
  summary: { rejectedRows: 0, warningCount: 0 }, complete: true,
}
const workspace = { companies: [{ id: 'synthetic-company' }], rowsByTable: { departments: [] } }
const makeUuid = () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('atomic database import submission', () => {
  it('submits mapped rows through the single transactional RPC and reuses a stable retry key', async () => {
    const first = makeClient()
    const second = makeClient()
    await submitImportBatch({ client: first.client, category: 'departmentMaster', stage, companyId: 'synthetic-company', workspace, makeUuid })
    await submitImportBatch({ client: second.client, category: 'departmentMaster', stage, companyId: 'synthetic-company', workspace, makeUuid })

    expect(first.rpc).toHaveBeenCalledOnce()
    const firstArgs = first.rpc.mock.calls[0][1]
    const secondArgs = second.rpc.mock.calls[0][1]
    expect(firstArgs.target_batch_id).toBe(secondArgs.target_batch_id)
    expect(firstArgs.target_rows).toHaveLength(1)
    expect(firstArgs.target_rows[0]).toMatchObject({ company_id: 'synthetic-company', department_key: 'ENG', department_name: 'Engineering' })
    expect(first.from).toHaveBeenCalledOnce()
  })

  it('uses a distinct retry key when the synthetic row payload changes', async () => {
    const first = makeClient()
    const changed = makeClient()
    await submitImportBatch({ client: first.client, category: 'departmentMaster', stage, companyId: 'synthetic-company', workspace, makeUuid })
    await submitImportBatch({
      client: changed.client, category: 'departmentMaster',
      stage: { ...stage, rows: [{ departmentId: 'FIN', department: 'Finance' }] },
      companyId: 'synthetic-company', workspace, makeUuid,
    })

    expect(first.rpc.mock.calls[0][1].target_batch_id).not.toBe(changed.rpc.mock.calls[0][1].target_batch_id)
    expect(first.rpc.mock.calls[0][1].target_metadata.payloadHash).not.toBe(changed.rpc.mock.calls[0][1].target_metadata.payloadHash)
  })

  it('stops before writes when the visible database contains a duplicate', async () => {
    const mock = makeClient()
    const duplicateWorkspace = { ...workspace, rowsByTable: { departments: [{ company_id: 'synthetic-company', department_key: 'ENG' }] } }
    await expect(submitImportBatch({ client: mock.client, category: 'departmentMaster', stage, companyId: 'synthetic-company', workspace: duplicateWorkspace, makeUuid })).rejects.toThrow('visible database duplicate')
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it('uses the original batch key for a retry instead of creating a duplicate batch', async () => {
    const original = makeClient()
    await submitImportBatch({ client: original.client, category: 'departmentMaster', stage, companyId: 'synthetic-company', workspace, makeUuid })
    const priorArgs = original.rpc.mock.calls[0][1]
    const retry = makeClient({
      batch: {
        id: priorArgs.target_batch_id, company_id: 'synthetic-company', dataset_type: 'department_master',
        reporting_month: null, uploaded_by: 'synthetic-user', status: 'Validated', metadata: priorArgs.target_metadata,
      },
      rpcData: { batchId: priorArgs.target_batch_id, status: 'Validated', totalRows: 1, reportingMonth: null, reused: true },
    })
    const retryWorkspace = { ...workspace, rowsByTable: { departments: [{ company_id: 'synthetic-company', department_key: 'ENG' }] } }
    const result = await submitImportBatch({ client: retry.client, category: 'departmentMaster', stage, companyId: 'synthetic-company', workspace: retryWorkspace, makeUuid })
    expect(result.reused).toBe(true)
    expect(retry.rpc.mock.calls[0][1].target_batch_id).toBe(priorArgs.target_batch_id)
  })

  it('fails closed when prior batch status cannot be read', async () => {
    const mock = makeClient({ lookupError: new Error('permission denied') })
    await expect(submitImportBatch({ client: mock.client, category: 'departmentMaster', stage, companyId: 'synthetic-company', workspace, makeUuid })).rejects.toThrow('Could not check the previous submission')
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it('clearly blocks imports until the reviewed atomic RPC is installed', async () => {
    const mock = makeClient({ rpcError: { code: 'PGRST202', message: 'Could not find the function in the schema cache' } })
    await expect(submitImportBatch({ client: mock.client, category: 'departmentMaster', stage, companyId: 'synthetic-company', workspace, makeUuid })).rejects.toThrow('No import batch was submitted')
  })

  it('does not retry or claim success for a legacy batch needing administrator review', async () => {
    const mock = makeClient({ rpcError: { code: '55000', message: 'legacy Uploaded batch' } })
    await expect(submitImportBatch({ client: mock.client, category: 'departmentMaster', stage, companyId: 'synthetic-company', workspace, makeUuid }))
      .rejects.toThrow('No existing rows were changed')
    expect(mock.rpc).toHaveBeenCalledOnce()
  })

  it('does not write if the authenticated user cannot be verified', async () => {
    const mock = makeClient({ authError: new Error('session expired') })
    await expect(submitImportBatch({ client: mock.client, category: 'departmentMaster', stage, companyId: 'synthetic-company', workspace, makeUuid })).rejects.toThrow('Session verification failed')
    expect(mock.from).not.toHaveBeenCalled()
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it('blocks oversized batches before the lookup or RPC', async () => {
    const mock = makeClient()
    await expect(submitImportBatch({
      client: mock.client, category: 'departmentMaster', companyId: 'synthetic-company', workspace,
      stage: { ...stage, rows: Array(5001).fill(stage.rows[0]) },
    })).rejects.toThrow('5,000 rows')
    expect(mock.from).not.toHaveBeenCalled()
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it('preserves cost centre and validates the manager in Employee History mapping', async () => {
    const mock = makeClient()
    const history = { employeeId: 'SYN-1', effectiveFrom: '2025-01-01', costCentre: 'SYN-CC', managerEmployeeId: 'SYN-2' }
    const historyWorkspace = { ...workspace, rowsByTable: { employees: [
      { company_id: 'synthetic-company', id: 'employee-id', employee_code: 'SYN-1' },
      { company_id: 'synthetic-company', id: 'manager-id', employee_code: 'SYN-2' },
    ] } }
    const input = { client: mock.client, category: 'employeeHistory', companyId: 'synthetic-company', workspace: historyWorkspace }
    await submitImportBatch({ ...input, stage: { ...stage, rows: [history] } })
    expect(mock.rpc.mock.calls[0][1].target_rows[0]).toMatchObject({ cost_center: 'SYN-CC', manager_employee_id: 'manager-id' })
    await expect(submitImportBatch({
      ...input, stage: { ...stage, rows: [{ ...history, managerEmployeeId: 'SYN-MISSING' }] },
    })).rejects.toThrow('Manager Employee ID')
    expect(mock.rpc).toHaveBeenCalledOnce()
  })
})
