import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const status = spawnSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' })
assert.equal(status.status, 0, 'The disposable local Supabase stack must be running')
const values = Object.fromEntries(status.stdout.split(/\r?\n/).flatMap((line) => {
  const match = /^([A-Z_]+)=(?:"([^"]*)"|([^\s]+))$/.exec(line.trim())
  return match ? [[match[1], match[2] ?? match[3]]] : []
}))
const { API_URL: url, ANON_KEY, PUBLISHABLE_KEY, SERVICE_ROLE_KEY, SECRET_KEY } = values
const api = new URL(url)
assert.ok(api.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(api.hostname), 'Tests may only target a loopback stack')
const publicKey = PUBLISHABLE_KEY || ANON_KEY
const adminKey = SECRET_KEY || SERVICE_ROLE_KEY
assert.ok(publicKey && adminKey, 'Local Supabase API keys are required')

const client = (key, storage) => createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: Boolean(storage), detectSessionInUrl: false, storage },
})
const admin = client(adminKey)
const orgId = '10000000-0000-4000-8000-000000000001'
const companyId = '20000000-0000-4000-8000-000000000001'
const password = `${randomUUID()}Aa!7`
const nonce = randomUUID()

function data(result, step) {
  assert.equal(result.error?.code || result.error?.status || (result.error ? 'error' : null), null, step)
  return result.data
}

async function signIn(label, roleKey, organizationId = orgId) {
  const email = `peoplepulse-${label}-${nonce}@example.com`
  const { user } = data(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `Provision synthetic ${label}`)
  if (roleKey) {
    data(await admin.from('user_roles').insert({
      user_id: user.id, organization_id: organizationId, role_key: roleKey,
      company_id: roleKey === 'hr_admin' ? companyId : null,
    }), `Assign role to synthetic ${label}`)
  }
  const items = new Map()
  const storage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
  }
  const signedIn = client(publicKey, storage)
  const signedInUser = data(await signedIn.auth.signInWithPassword({ email, password }), `Password login for ${label}`)
  assert.equal(signedInUser.user.id, user.id)
  return { signedIn, userId: user.id, storage }
}

const outsideOrg = randomUUID()
data(await admin.from('organizations').insert({ id: outsideOrg, organization_key: `outside-${nonce}`, organization_name: 'Synthetic Outside Org' }), 'Seed isolated outside organization')

const uploader = await signIn('uploader', 'hr_admin')
const reviewer = (await signIn('reviewer', 'hr_admin')).signedIn
const approver = (await signIn('approver', 'hr_admin')).signedIn
const publisher = (await signIn('publisher', 'super_admin')).signedIn
const outside = (await signIn('outside', 'super_admin', outsideOrg)).signedIn
const unassigned = (await signIn('unassigned')).signedIn
const restored = client(publicKey, uploader.storage)
assert.equal(data(await restored.auth.getSession(), 'Restore persisted session').session.user.id, uploader.userId)
assert.equal(data(await restored.auth.getUser(), 'Validate restored identity').user.id, uploader.userId)
assert.deepEqual(data(await restored.from('organizations').select('id'), 'Read organization under RLS'), [{ id: orgId }])
assert.deepEqual(data(await unassigned.from('organizations').select('id'), 'Read with no assigned role'), [])
assert.deepEqual(data(await outside.from('organizations').select('id'), 'Read from outside organization'), [{ id: outsideOrg }])

const batchId = randomUUID()
const departmentKey = `SYN-${nonce}`
const receipt = data(await restored.rpc('submit_peoplepulse_import_batch', {
  target_batch_id: batchId,
  target_company_id: companyId,
  target_dataset_type: 'department_master',
  target_reporting_month: null,
  target_metadata: { payloadHash: 'a'.repeat(64) },
  target_rows: [{ company_id: companyId, source_batch_id: batchId, department_key: departmentKey, department_name: 'Synthetic Auth Workflow' }],
}), 'Submit through public RPC')
assert.equal(receipt.status, 'Validated')
const transition = (connection, nextStatus) => connection.from('import_batches').update({ status: nextStatus }).eq('id', batchId).select('status')
assert.equal((await transition(restored, 'Reviewed')).error?.code, '42501', 'Uploader cannot self-review')
assert.deepEqual(data(await transition(outside, 'Reviewed'), 'Cross-organization workflow request'), [])
assert.deepEqual(data(await reviewer.from('departments').select('id').eq('department_key', departmentKey), 'Unpublished source stays hidden'), [])
const inspect = (connection) => connection.rpc('inspect_peoplepulse_import_batch', { target_batch_id: batchId })
assert.equal((await inspect(restored)).error?.code, '42501', 'Uploader cannot independently inspect')
assert.equal((await inspect(outside)).error?.code, '42501', 'Outside organization cannot inspect')
assert.equal((await inspect(unassigned)).error?.code, '42501', 'Unassigned account cannot inspect')
assert.deepEqual(data(await inspect(reviewer), 'Independent scoped inspection').rows.map((row) => row.department_key), [departmentKey])
assert.deepEqual(data(await transition(reviewer, 'Reviewed'), 'Independent review'), [{ status: 'Reviewed' }])
assert.equal((await transition(reviewer, 'Approved')).error?.code, '42501', 'Reviewer cannot self-approve')
assert.deepEqual(data(await transition(approver, 'Approved'), 'Independent approval'), [{ status: 'Approved' }])
assert.equal((await transition(approver, 'Published')).error?.code, '42501', 'HR Admin cannot publish')
assert.deepEqual(data(await transition(publisher, 'Published'), 'Authorized publication'), [{ status: 'Published' }])
assert.equal((await inspect(reviewer)).error?.code, '42501', 'Published batch is excluded from unpublished inspection')
assert.equal(data(await reviewer.from('departments').select('id').eq('department_key', departmentKey), 'Published source becomes visible').length, 1)
data(await restored.auth.signOut(), 'Sign out restored client')
assert.equal(data(await client(publicKey, uploader.storage).auth.getSession(), 'Read session after logout').session, null)
console.log('Local Auth and Data API passed password sign-in, session restoration, logout, tenant denial, atomic submission, and independent review, approval and publication.')
