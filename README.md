# PeoplePulse HR Analytics

A responsive HR analytics dashboard built with React, Vite, Tailwind CSS, Recharts, Lucide React, and ExcelJS. Dashboard metrics use synthetic records. Phase 1 file imports are parsed and staged only in browser memory; no uploaded file or parsed HR row is sent to a server or persisted in browser storage.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite (typically `http://localhost:5173`). To verify a production build, run `npm.cmd run build`; preview the output with `npm.cmd run preview`.

Run unit and import/analytics tests with `npm.cmd test`, lint with `npm.cmd run lint`, and a production build with `npm.cmd run build`. For browser tests, first start Vite in a separate terminal with `npm.cmd run dev -- --host 127.0.0.1`, then run `npm.cmd run test:e2e` (requires Google Chrome).

## Authentication modes

The default entry is a password-free **Synthetic Demo** mode. It uses fictional dashboard records and stores only a tab-scoped demo-mode flag. It is a navigation convenience, not authentication or a way to protect confidential data.

To enable organisation sign-in, copy `.env.example` to `.env.local`, set `VITE_SUPABASE_URL` and the Supabase project's public `VITE_SUPABASE_ANON_KEY`, then restart Vite. The Supabase Auth client uses PKCE, tab-scoped session storage, token refresh, email/password sign-in, and password reset. Create accounts through the trusted Supabase admin process; public sign-up is not enabled. Never place a service-role key in a Vite variable. Authentication alone does not connect the dashboard to the database or enforce application roles; database policies and server-side checks must be applied and verified before using real data.

## What's included

- Executive KPIs with opening and closing headcount, average headcount, employment type, net movement, gross payroll, joiners, exits, attrition, and attendance.
- Explicit imported Exit Records can confirm exit dates and provide an exit-type profile and average tenure-at-exit metric; conflicting dates lower readiness, and omitted employees are never assumed to have exited.
- Workforce, payroll and CTC, attendance and leave, performance and increments, and project allocation views.
- Project costs support an explicit Payroll Gross, Allocation Row Gross, or Best Available basis; incomplete selected cost sources are reported as unavailable, and the chosen basis carries into project exports.
- Payroll imports support optional Basic, HRA, allowances, employer PF/ESIC, gratuity, variable pay, incentives, arrears, and overtime fields. Component totals require complete in-scope coverage and are shown separately from monthly gross and CTC.
- Employee Master directory with shared-filtered search, status as of the selected date, safe profile details, recorded join/project/exit history, and filtered CSV export.
- Shared month, as-of date, company, department, location, and employment-type filters; responsive navigation; Recharts visualisations; searchable employee tables; and CSV export of filtered rows.
- Source timestamp in the page header: the synthetic demo load time or latest successful in-tab import time, with a clear empty state when no imported data has been staged.
- Header Help panel with guidance for shared filters, imported-data readiness, local-only staging, report exports, and a working shortcut to KPI definitions.
- Header notifications based on the selected imported month’s readiness blockers and staged validation warnings, with direct links to Data Quality or Data Import.
- Indian currency formatting and empty states for filter combinations without sample data.
- Configurable reporting-year start month for FYTD leave utilisation and year-to-date comparisons; April–March is the default. Imported leave uses staged balances only after completeness, employee coverage, and reconciliation checks pass.
- Imported approved increments: effective-dated annual CTC increases are converted to a monthly run-rate; pending/rejected changes are excluded, and comparisons use a complete Increment source plus a dimension-compatible HR Budget.
- Data Import Centre for Employee Master and effective-dated Employee History, Payroll, Attendance, Leave, Performance, Increment, Project Allocation, Project Master, Department Master, Location Master, Exit Records, Recruitment, Contract Manpower, and HR Budget.
- Data Quality dashboard with period readiness, source completeness, rejected-row/warning summaries, reference and allocation checks, last staging time, attendance day reconciliation when its complete inputs are supplied, and optional per-file payroll control-total reconciliation with differences shown in Data Quality.
- Local `.csv` and `.xlsx` parsing in dedicated browser workers, worksheet selection, column mapping, 20-row preview, validation reports, and synthetic CSV/Excel templates.
- Recent successful import history with file/category/action and row-count metadata only, plus one-step rollback for the latest staging action; both are tab-memory only and are cleared on refresh or sign out.
- Monthly imports append without removing other months, reject duplicate staged keys, and require explicit confirmation to replace only the reporting periods included in the replacement file.
- An explicit Demo Data / Imported Data selector. Core analytics require source completeness and cross-reference checks; planning modules use only their own staged data and label unconfirmed months provisional.
- Recruitment, Contract Manpower, and HR Budget modules with imported-source-only metrics and empty states in Demo Data.
- Monthly people-movement and attrition charts using the same average-headcount formula as the KPI.
- Executive quarter-to-date and configured reporting-year-to-date headcount/payroll comparisons against matching prior periods, shown only when the underlying monthly history is available and complete.
- Executive Dashboard KPI formula reference and a Data Import quality summary showing category coverage, incomplete sources, and unresolved references.
- Reports Centre with 17 filter-aware report types, CSV, multi-sheet Excel, and native PDF downloads. PDFs include the active filters, reporting period, page numbers, and an executive headcount trend graphic. Recruitment, contract, and budget rows carry source completeness status.

## Project layout

- `src/data/hrModel.js` contains normalized imported records, historical month calculations, completeness checks, and documented KPI formulas.
- `src/data/planningModel.js` calculates requisition, contract vendor cost, and budget-versus-available-actual summaries from staged monthly rows.
- `src/data/planningModel.test.js` verifies planning metrics and completeness-dependent actuals.
- `src/data/hrModel.test.js` tests imported headcount, payroll, attendance, allocation, filters, and completeness.

- `src/data/demoData.js` — deterministic synthetic employee records and derived workforce metrics.
- `src/components/Sidebar.jsx` — responsive application navigation.
- `src/components/DashboardParts.jsx` — shared KPI, chart panel, tooltip, and empty-state components.
- `src/App.jsx` — application shell, shared filters, source selection, and module routing.
- `src/auth/supabaseClient.js` and `src/auth/sessionStatus.js` — optional Supabase Auth client, tab-scoped session settings, and auth state transitions.
- `src/components/Login.jsx` — provider login, email password reset, recovery, and separate synthetic demo entry.
- `src/components/DashboardModules.jsx` — lazily loaded Executive, Workforce, Payroll, Attendance, Performance, and Project views.
- `src/components/EmployeeDirectory.jsx` — lazy Employee Master directory and profile drawer; it omits compensation fields.
- `src/components/PlanningModules.jsx` — lazily loaded Recruitment, Contract Manpower, and HR Budget views.
- `src/components/ReportsCenter.jsx` and `src/reports/reportData.js` — filtered report preview, CSV/Excel/PDF output, and shared report calculations.
- `src/data/csv.js` — shared CSV quoting and spreadsheet formula-injection protection.
- `src/App.css` and `src/index.css` — dashboard styling and Tailwind entry point.
- `tailwind.config.js` and `postcss.config.js` — Tailwind/PostCSS configuration.

The sample data is local to the application. When Supabase is configured, the app reads the signed-in account's active role and permission rows to filter navigation, report choices, and Excel worksheets; missing or unreadable roles fail closed. These are UI restrictions only. Dashboard data queries and export authorization are not connected to PostgreSQL, and the RLS migrations have not been applied or tested here. Imported rows remain in memory and are not sent to a server. Do not use this app for confidential HR or payroll records.

## Guides and limitations

- [HR analyst guide](docs/hr-analyst-guide.md) covers sign-in, filters, dashboard navigation, imports, and CSV downloads.
- [Administrator guide](docs/administrator-guide.md) covers local setup, authentication configuration, staging rules, validation, and production blockers.

## Database foundation (local review only)

`supabase/migrations/202611160001_peoplepulse_core.sql` defines the tenant-aware PostgreSQL schema and row-level policies. `202611160002_import_approval_security.sql` reserves organisation and role administration for Super Admins and adds database-enforced import review, approval, publication, actor separation, and audit events. `202611160003_approved_data_visibility.sql` ties HR source rows to uploader-owned batches, hides unapproved rows, and disallows direct or post-publication row changes. `202611160004_import_actor_integrity.sql` locks batch scope and requires the uploader to validate while preventing self-rejection. `202611160005_attendance_day_reconciliation.sql` adds day-level attendance inputs and database constraints. `202611160006_employee_history_import.sql` adds employee-history fields, an import-batch type, and publication-scoped RLS policies. `supabase/seed.sql` contains fictional sample rows only. `supabase/tests/peoplepulse_rls_test.sql` covers tenant boundaries, role escalation, import workflow transitions, unpublished-row visibility, approved data immutability, attendance day constraints, Employee History staging, and allocation limits. The React app can use Supabase Auth when configured, but dashboard data remains in synthetic records and browser-memory imports; it does not query the database. The database suite is configured in GitHub Actions, but has not yet run in this workspace because Supabase CLI, Docker, and PostgreSQL client tools are unavailable.

To review locally after installing Supabase CLI and Docker Desktop, run `npx supabase start`, then `npx supabase test db`. The configured seed is synthetic and runs only in the local Supabase database. Do not add project credentials or connect a production project as part of this setup. GitHub Actions installs the Supabase CLI, starts a local stack, runs this same pgTAP suite, and stops the stack before its frontend checks.

The import centre supports fifteen datasets for local preview, validation, and in-memory staging. Complete Employee History files apply department, location, designation, grade, employment type, manager, and cost-centre attributes by effective date; unconfirmed history is not applied. The SQL foundation enforces import batch transitions and records audit events, but the React app does not yet create persistent batches or expose an approval interface. Reports Centre provides filtered CSV, Excel, and native PDF downloads plus browser printing. The PDF and current report filtering use client-side role permissions and do not substitute for server-side export authorization. Imported data is tab-local memory and is intentionally discarded when the page reloads.

Additional import files:

- `src/import/importSchemas.js` defines the fifteen categories, field aliases, validation rules and synthetic template records.
- `src/import/fileParsers.js` validates file selection and starts a CSV or XLSX parsing worker; `fileParserCore.js` contains shared local parsing/normalisation; `csvParser.worker.js`, `fileParser.worker.js`, and `validation.worker.js` keep parsing and row validation off the UI thread.
- `src/import/validateImport.js` matches headers and performs row-level validation.
- `src/import/templates.js` generates synthetic CSV/XLSX templates and validation issue CSVs.
- `src/import/validateImport.test.js` contains automated parser and validation edge-case tests.
- `src/components/DataImportCenter.jsx` implements the import, preview, mapping, validation and in-memory staging interface.
- `src/components/DataQualityCenter.jsx` summarises staged-data quality without exposing employee-level records.

Dashboard visualisations and the import centre are split into deferred chunks to keep the initial JavaScript download smaller. CSV parsing uses a lightweight worker. XLSX parsing, Excel template generation and reports load ExcelJS only when requested; XLSX processing runs in a worker so workbook parsing does not block the UI thread.

Imported rows exist only in React memory and are cleared by a page refresh or tab close. The imported dashboard is gated on declared source completeness and verified employee/project references. Sign-in and data handling remain demos, not production authentication or a secure HR data-processing system.

## Deployment

The app is a standard Vite static build. `vercel.json` configures SPA deep-link fallback and baseline response security headers. Vite's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are public client configuration values; configure them in the hosting provider only when using the optional Auth flow. Never add a service-role key or confidential data to a `VITE_` variable.

For Vercel, import the repository with the Vite preset, keep the root directory at the project root, use `npm run build`, and set output directory to `dist`. For GitHub, `.github/workflows/ci.yml` runs dependency installation, lint, unit tests, Playwright browser tests, and a production build on pushes to `main` and pull requests. It installs Playwright Chromium and starts Vite for the browser suite. The workflow does not deploy. GitHub Pages can host the build output, but its base path must be configured for the repository URL before publishing. No repository creation, commit, push, or deployment is performed by this project setup.
