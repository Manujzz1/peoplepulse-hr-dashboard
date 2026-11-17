# Administrator Guide

## Local setup

From the project directory, run:

```powershell
npm.cmd install
npm.cmd run dev
```

The password-free Synthetic Demo entry uses fictional records only. To configure Supabase Auth for organisation sign-in, copy `.env.example` to `.env.local`, set the project URL and public anon key, then restart Vite. Add accounts and scoped role assignments through a trusted Supabase admin workflow; public sign-up is not enabled. Users without active role assignments are denied dashboard access. Department-scoped assignments limit the department filter and clear staged imports if the user lacks import permission. Never place the service-role key in frontend environment variables. Do not use the web app with real HR data until database policies, role enforcement, and authorised data access are connected and reviewed.

Supabase Auth configuration is optional for local synthetic demo use. Set the allowed redirect URL to the app's local origin for password recovery. Sessions are stored in `sessionStorage`, scoped to the current browser tab, and refreshed through the Supabase client. The Vite app reads only the current user's active `user_roles`, their `role_permissions`, and assigned department names. Navigation and report exports are filtered in the UI, while actual HR datasets remain synthetic or in-memory; PostgreSQL data queries and server-side export authorization are not connected. Apply and test the SQL migrations before relying on the database role policies.

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

Start Vite in one terminal with `npm.cmd run dev -- --host 127.0.0.1`, then run `npm.cmd run test:e2e` in another. On Windows it uses installed Google Chrome; Linux CI installs Chromium and starts Vite for the Playwright suite. The suite covers demo entry, navigation, shared filters, employee search/profile, CSV staging without network requests, report downloads, and a 390 px mobile viewport.

## Vercel and GitHub preparation

The root `vercel.json` provides the Vite single-page app deep-link fallback and baseline browser security headers. In Vercel, use the Vite preset with `npm run build` and `dist`; configure only the public Supabase URL and anon key if the optional Auth flow is needed. The GitHub Actions workflow runs the local Supabase migration/pgTAP suite, lint, unit tests, Playwright browser tests, and the production build on `main` pushes and pull requests. It does not publish or deploy the app. Neither workflow nor local configuration connects production HR data.

## Local database foundation

The `supabase/` directory is a reviewable database preparation only; the web application is not connected to it. The migrations define the tenant schema and RLS policies, reserve role assignment for Super Admins, enforce import approval transitions with distinct uploader, reviewer, and approver identities, require the uploader to validate, prevent self-rejection, lock the batch scope, and ensure batch-backed source rows remain hidden until publication and immutable afterward. Attendance schema checks support calendar, working, present, weekly-off, holiday, paid/unpaid leave, LOP, and payable days. Migration `202611160006_employee_history_import.sql` adds the effective-dated attributes and publication-scoped policies for Employee History batches. To apply the migrations, load fictional seed rows, and run the pgTAP suite locally, install Supabase CLI and Docker Desktop, then use:

```powershell
npx supabase start
npx supabase test db
```

The migration and SQL suite have not been executed in this workspace because the required database tools are unavailable. No hosted project, credentials, or production data are configured. Review the SQL and run the local suite before treating these policies as verified.

## Production work still required

Before handling real HR information, connect the dashboard to the trusted identity provider, apply and test all migrations, connect server-side data queries and role-aware UI access, connect the import interface to persistent batches and the approval workflow, secure report authorization, define retention controls, and configure deployment secrets. Persistent import history is outside the current UI implementation. PDF, CSV, and Excel files are generated locally from client-side data and filtered by the role profile loaded by the app; the server does not yet authorize report exports. Imported Recruitment, Contract Manpower, and HR Budget rows are staged and reported as provisional unless their source completeness is confirmed. Do not deploy this app for production employee data until those controls are built and reviewed.
