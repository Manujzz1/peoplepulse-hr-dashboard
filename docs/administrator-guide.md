# Administrator Guide

## Local setup

From the project directory, run:

```powershell
npm.cmd install
npm.cmd run dev
```

The password-free Synthetic Demo entry uses fictional records only. To configure Supabase Auth for organisation sign-in, copy `.env.example` to `.env.local`, set the project URL and public publishable key, then restart Vite. Add accounts and scoped role assignments through a trusted Supabase admin workflow; the app has no public sign-up screen. See [deployment readiness](deployment-readiness.md) for the hosted public sign-up finding and approval step. Users without active role assignments are denied dashboard access. Department-scoped assignments limit the department filter and clear staged imports if the user lacks import permission. Never place the service-role key in frontend environment variables. Do not import real employee or payroll data until the local pgTAP suite passes and the required live-session isolation tests are run.

Supabase Auth configuration is optional for local synthetic demo use. In the Supabase Auth URL Configuration, set Site URL to the exact production origin and add only exact trusted redirect URLs for production and local development (for example `http://localhost:5173` during development). The password reset redirect uses `window.location.origin`; do not allow arbitrary origins or wildcards beyond the specific development host. Keep public sign-ups disabled for this private HR portal, require email confirmation for any administrator-provisioned account, enable leaked-password protection, and use the strongest available password policy. Review SMTP delivery and reset email templates before onboarding. Hosted Auth settings are not changed by this repository.

The browser uses a publishable Supabase key and PKCE with tab-scoped `sessionStorage`, session restoration, automatic token refresh, password login, logout, and password recovery. `auth.getUser()` verifies identity before live reads and sensitive exports. Role permissions and department scopes are refreshed from database rows. All live reads use an allowlisted repository and the user's ordinary authenticated session; PostgreSQL RLS remains the tenant boundary. If a live query fails, the app shows an error and requires an explicit switch to synthetic demo mode. Never add a service-role or secret key to Vite variables.

Project headcount and utilization require `projects.read` and employee-level project records require `employee.read`. The project page hides salary and project cost details unless the user also has `payroll.read`. Project allocation and project cost exports have the same payroll permission requirement.

Attendance analytics require `attendance.read` and `employee.read`. Leave utilization cards, department breakdowns, and employee leave columns require the additional `leave.read` permission; attendance-only users can still access attendance metrics and reports.

## Data handling

The import centre parses CSV/XLSX files and validates mapped rows locally in dedicated browser workers, enforces the 10 MB file limit, maps fields, reports row validation issues, and keeps valid records in React memory. CSV uses a small parser worker; ExcelJS is loaded only when an XLSX file is selected, and workbook parsing runs in a separate worker. It makes no upload request and does not persist parsed values to browser storage. Successful staging history contains metadata only and is tab-scoped; a one-step rollback snapshot of the previous category stage is also kept in React memory until another staging action or tab reset. Imported dashboard use is gated by explicit completeness declarations and cross-reference checks. A confirmed Employee History dataset applies effective-dated department, location, designation, grade, employment type, manager, and cost-centre values to historical reporting; overlapping intervals are rejected. Without confirmed history, past-period filters use roster attributes. Approved Increment rows affect effective-period analytics only when their source month is confirmed complete; pending/rejected revisions are excluded from cost impact. A reload clears staged records, history, and rollback state.

Templates contain fictional sample data. Use the supported category field definitions in `src/import/importSchemas.js` when preparing input files. Attendance may supply a percentage or present/working-day values; percentage-only historical files remain supported. Day reconciliation requires all day fields and treats Calendar Days as employee-eligible calendar days for that reporting month. For Payroll, enter the source gross control total for each file month when available; Data Quality compares the total with valid rows in that file and keeps mismatched months unavailable for dashboard payroll analytics. This is a browser-memory reconciliation record, not a persisted approval or audit record. Confirm the roster as-of date, Project Master completeness, and per-month completeness only after reconciling each source against its authoritative report.

## Checks

```powershell
npm.cmd test
npm.cmd run test:e2e
npm.cmd run lint
npm.cmd run build
```

Run `npm.cmd run test:e2e`; the runner starts and closes its own isolated Vite server, with Supabase URL/key blank so browser tests cannot contact a database. On Windows it uses installed Google Chrome; Linux CI uses Chromium. The suite covers demo entry, navigation, shared filters, employee search/profile, CSV/XLSX staging without network requests, report downloads, and a 390 px mobile viewport.

## Vercel and GitHub preparation

The root `vercel.json` provides the Vite single-page app deep-link fallback and baseline browser security headers. In Vercel, use the Vite preset with `npm run build` and `dist`; add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the intended deployment environments. These public client values connect the browser to Supabase Auth and the RLS-protected Data API. Never configure a service-role key as a Vite variable. The GitHub Actions workflow runs the local Supabase migration/pgTAP suite, lint, unit tests, Playwright browser tests, and the production build on `main` pushes and pull requests. It does not publish or deploy the app. Neither workflow nor local configuration connects production HR data.

## Local database foundation

The six migrations have been applied to the hosted project `moxnyczdleagujjxwncw`; the database was verified with 25 RLS-enabled tables. The dashboard's live mode reads only authenticated, RLS-visible records and uses organization, company, department, location, and reporting-period filters where data supports them. Unapproved imported rows remain hidden by database policies. The migrations reserve role assignment for Super Admins, require separate uploader, reviewer and approver identities and a publisher with publish permission, and keep batch-backed data unpublished until the workflow completes. Attendance has day reconciliation constraints; Employee History has effective-dated fields and a separate batch type/policy.

Database-backed imports use a single idempotent RPC request so batch creation, row insertion, and validation share one PostgreSQL transaction. The matching function draft is [submit_peoplepulse_import_batch.sql](../supabase/admin/submit_peoplepulse_import_batch.sql). The hosted project does not yet have this RPC; the browser fails closed until a separately reviewed migration is approved and applied. The RPC draft never deletes or replaces rows in an existing batch; an older incomplete `Uploaded` batch stops for administrator review. Do not import real HR data before the RPC is separately approved and installed. This client does not run seed data and no hosted Auth users or RLS policies were changed during this work. See [deployment readiness](deployment-readiness.md) for local commands covering both pgTAP suites.

The pgTAP suite uses synthetic Auth users and tenant records inside a transaction and must run only against a disposable local database, never production. In this workspace, the Supabase CLI telemetry permission issue was resolved safely by setting `SUPABASE_HOME` to a task-local temporary directory and disabling telemetry there. The CLI then reported Docker/Podman unavailable; `supabase test db` could not connect to the local database at `127.0.0.1:54322`. The full stack is unavailable in this workspace. A later disposable embedded PostgreSQL run passed both suites. No synthetic users or tests were sent to production. See [final security verification](final-security-verification.md).

## Production work still required

Before importing real HR information, run the pgTAP suite in an isolated local environment, validate each role with real authenticated sessions, and complete the required RLS tests (anonymous denial, cross-organization and company isolation, department scoping, payroll permissions, role escalation, and import actor separation). Exports revalidate the current authenticated user and permissions, apply RLS before data reaches the browser, neutralize spreadsheet formula text, and refresh live data snapshots older than 30 seconds; after refresh the user must initiate export again. These are client-generated files and cannot prevent an authorized user from copying information they can already view. Review retention, backup, audit, incident response, and exact production redirect settings before real employee/payroll imports. No real employee data has been imported.
