# PeoplePulse final security verification

Reviewed on 22 November 2026 (India Standard Time). Release approval is withheld.

| Gate | Status | Evidence and next action |
| --- | --- | --- |
| RLS policy review | PASS | Reviewed the six baseline migrations and the two local candidates. Embedded catalogs reported RLS enabled on all 25 public tables and zero public views. Compare the hosted catalog and migration history before approving SQL. |
| Runtime pgTAP tests | PASS | 73 of 73 assertions passed in disposable PostgreSQL 18.7 with local Auth fixtures. Repeat against a full isolated Supabase stack matching the hosted database version before production installation. |
| Atomic RPC SQL tests | PASS | 19 of 19 assertions passed in the same PostgreSQL runtime. Coverage includes session claims, company and organization boundaries, limits, malformed data, retries, unpublished visibility, and rollback of data, batch and audit rows. |
| Import approval isolation | PASS | Embedded tests exercised uploader, reviewer, approver and publisher transitions, publication visibility, and five recorded audit events. Independent reviewer access to unpublished row contents still requires a scoped design and an authenticated app check. Legacy table staging remains available to authorized roles. |
| Payroll access restrictions | PASS | Embedded tests checked anon grants, Management denial, company-scoped HR Admin payroll access, invisibility before publication, and published-row immutability. Verify actual hosted roles and policy parity separately. |
| Auth settings | NOT VERIFIED | The follow-up sign-in investigation confirmed public sign-up and anonymous sign-in are now disabled. Confirm the remaining management-only settings below. |
| Real Super Admin login | NOT VERIFIED | The account holder must perform the interactive checks below. |
| Export security | NOT VERIFIED | Local checks cover scope changes, stale reads, authorization and synthetic CSV, Excel and PDF. Verify actual tenant and payroll grants, expired sessions and print on an isolated authenticated deployment. |
| Secrets review | PASS | No privileged Supabase credential patterns in 153 local source/build files or the four hosted frontend assets discovered from the public homepage. The expected Supabase URL could not be confirmed from those hosted assets. |
| Production RPC migration readiness | BLOCKED | A versioned candidate exists. Verify production migration history and catalog, run full-stack isolated checks, address legacy staging and review controls, and establish a recovery point before requesting execution approval. |

## Database audit and local fixes

- Organization joins and composite company foreign keys enforce tenant relationships. Company and department permission predicates scope ordinary reads and writes. Role assignment is restricted to organization-level Super Admins. Audit rows lack authenticated update privileges.
- Private definer helpers use empty search paths and explicit grants. The new allocation trigger includes staged allocations in the existing 100% limit while leaving dashboard visibility under RLS. It runs after the row passes write authorization, stays in the private schema and has no application execute grant. The function returns only a constraint failure.
- The RPC draft had a PL/pgSQL parse error in its expiration check. The corrected invoker routine compiles and stops at Validated. Its explicit grants, allowlists and request limits run alongside existing RLS. Existing authorized direct table staging does not use the RPC's limits or transaction contract.
- The RLS suite now uses the intended HR Admin identity for the payroll workflow, expects direct edits to published or seed employee records to be denied, checks staged project allocation without requesting unpublished rows back, and adds unassigned-user, unauthorized-delete and staged-visibility checks.
- Live exports now match the newly verified account, effective role grants and scope assignments to the snapshot before writing a file. A scope change blocks the export, including when the role still offers the same report. Reload to refresh scope.

The embedded run uses PostgreSQL in WebAssembly with pgTAP and a minimal local Auth schema. It exercises real SQL, PL/pgSQL, constraints, grants and RLS. Auth token issuance, PostgREST, production settings and multi-session concurrency require the full stack. Docker and Podman are absent on Windows and Ubuntu WSL 2. Local Supabase refused the database connection at `127.0.0.1:54322`; Ubuntu package installation needs interactive privileges. An independently approved, empty Supabase test project or preview branch can run the stack. Confirm compute, storage and branch charges before creating one.

To reproduce the embedded results from the repository root:

```powershell
$peoplePulseTestDir = Join-Path $env:TEMP 'peoplepulse-step2-pg'
npm.cmd install --prefix $peoplePulseTestDir --cache (Join-Path $peoplePulseTestDir 'npm-cache') --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.5.17 @electric-sql/pglite-pgtap@0.0.18
Copy-Item -LiteralPath scripts/test-db-embedded.mjs -Destination (Join-Path $peoplePulseTestDir 'test-db-embedded.mjs')
node (Join-Path $peoplePulseTestDir 'test-db-embedded.mjs')
```

The full local Supabase path is `supabase.exe start`, `supabase.exe test db`, then `supabase.exe stop`. The two versioned candidates are applied on startup with the existing migrations. Use a fresh isolated database and the default local test target.

## Final validation

Vitest passed 156 tests in 25 files. Playwright passed all four synthetic browser tests, including import preview and CSV, Excel and PDF downloads. Lint, the production build, and staged and unstaged Git whitespace checks passed. Vite reported the existing large lazy ExcelJS chunks. Both embedded SQL suites passed with zero failures and skips. Full-stack PostgreSQL/Supabase tests and interactive hosted browser checks remain pending.

## Exact hosted checks

1. Open Supabase project `moxnyczdleagujjxwncw`. In **Authentication → Providers / Sign In**, keep **Allow new users to sign up** and **Allow anonymous sign-ins** off. Confirm the Email provider's **Confirm email** toggle is on.
2. Under **Authentication → Password Security**, confirm minimum password length, required character types and leaked-password protection. Under **Authentication → URL Configuration**, confirm Site URL `https://peoplepulse-hr-dashboard.vercel.app`, the production origin used for password reset, and only approved redirect entries. The approved development pattern is `http://localhost:5173/**`. Check the email recovery template for the intended callback. Confirm these values without sharing keys or tokens.
3. In a private browser window, visit the existing site and sign in as the existing Super Admin account. Confirm the organization is the expected production organization, the assignment is `super_admin`, and live mode shows either authorized data or an explicit empty state. Reload the same tab, check the role and source again, then sign out and reload a deep link. Confirm it opens the sign-in gate. Exercise token expiry, reset delivery and PKCE callback on an isolated account. Verify authenticated CSV, XLSX, PDF and print with permitted and restricted synthetic roles and active filters.
4. From authorized production SQL access, read `supabase_migrations.schema_migrations`, `pg_policies`, public table RLS flags, function grants and search paths, and `server_version`. Compare the six baseline versions and published-data policies with the local source. No management session or database connection was available for this comparison during the review.

## Candidate migration, approval and recovery

1. Review `20261121235346_enforce_allocation_limit_across_staged_rows.sql` followed by `20261121235434_install_atomic_peoplepulse_import_rpc.sql`. The latter matches the corrected administrative draft byte for byte. Review any existing over-limit allocation groups before installation and resolve their treatment in the change review.
2. Before requesting execution approval, run both suites on an isolated Supabase stack, verify realistic Auth and Data API behavior, and confirm the hosted catalog and migration history. In the Supabase backup page, record the most recent usable backup or PITR recovery point and confirm the recovery procedure and scope with the database owner.
3. The eventual approval must identify both migration versions, in order, and the exact target project `moxnyczdleagujjxwncw`. Testing approval covers testing only. The two SQL files remain local and production execution approval is withheld.
4. After approved installation, check both migration versions and the public RPC signature, invoker flag, empty search path and authenticated execute grant. Confirm anon and service_role lack explicit execute and the private allocation hook remains trigger-only. Verify stale or malformed metadata handling and negative workflow behavior in the isolated stack. Perform only read-only production smoke checks without uploading employee data.
5. If the RPC must be disabled, pause imports, review a targeted revoke of its execute grant, and obtain a separate database approval. Preserve existing batches, source rows and audit events. If the allocation change causes a regression, pause allocation imports and review a forward remediation with the database owner. Reverting to the old rule would reintroduce validation gaps. Restore a recovery point only with approval after reconciling changes written since that point. Handle frontend rollback independently through the Vercel deployment history.
