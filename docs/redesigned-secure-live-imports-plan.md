# PeoplePulse redesigned — secure live imports implementation gate

Status: **Preparation only; imports NOT enabled.** Base release: `75b9bd3ecfe35f00535c1bb3c1dd3f31192f09b6`.

## Existing architecture verified from repository
- `vite.config.js` routes `PEOPLEPULSE_STANDALONE_SAMPLE=true` builds to `src/sampleMain.jsx`; the redesigned public site therefore does not run the authenticated `src/App.jsx` application.
- `src/App.jsx` has Supabase authentication, role-based access, live workspace loading, `DataImportCenter`, and a `VITE_ENABLE_LIVE_IMPORTS` gate.
- `src/import/remoteImport.js` includes database batch mapping and submission paths; the existence of code alone does **not** establish that its required production RPC/migrations are installed.
- The original site's database, users, RLS, and production deployment must not be modified as a side effect of enabling the redesign.

## Required implementation sequence
1. Inspect `src/sampleMain.jsx`, `src/auth/supabaseClient.js`, `src/auth/accessControl.js`, `src/components/DataImportCenter.jsx`, `src/import/remoteImport.js`, all import-related tests, and current Vercel build settings.
2. Decide and implement an explicit two-mode build: existing **public fictional demo** (no credentials, no live import controls) and **authenticated secure application** (login, company/department-scoped permissions, live data and import UI). Never present live import actions to anonymous users.
3. Ensure the secure build uses the redesigned Executive Dashboard UI with live scoped metrics. Never mix synthetic sample figures with real figures; use clearly labelled data-source modes. Preserve the original standalone sample site until a secure replacement is verified.
4. Verify the four previously reviewed, **unapplied** security migrations and database RPC compatibility, including atomic import submission, staged-row isolation, scoped review and allocation validation. Do not apply migrations without the existing independent DBA release approval. A user approval to prepare GitHub code is not a substitute for that security sign-off.
5. Verify organization/company membership, server-enforced permissions, tenant isolation, input validation, duplicate and reconciliation checks, review/approval, atomic commit, rollback/recovery behavior, and audit trail. Do not depend on frontend flags for authorization.
6. Use a Supabase publishable key only in browser builds; never expose database passwords, service-role keys or private tokens. Configure exact authorized redirect URLs for the separate secure deployment, and test login, logout and cross-company isolation.
7. Cover Excel/CSV import categories (employee master, payroll, attendance, leave, performance, increments, projects, recruitment, contractor and budget) using schema-supported fields. Explicitly reject unsupported fields rather than silently dropping them.
8. Add unit, integration and browser tests for unauthenticated access, denied roles, scoped imports, duplicate submissions, error recovery, export labeling, and live-versus-sample isolation. Run lint, unit tests, build and e2e.
9. Deploy to a separate protected preview first. Production activation of live writes must remain blocked until verified DBA approval, migration preflight and approved deployment configuration. Do not overwrite either existing production site.

## Release checklist
- [ ] Secure build and redesigned live-data UI implemented
- [ ] Automated tests passed
- [ ] Authenticated preview verified
- [ ] Database RPC/migration compatibility verified
- [ ] Independent DBA recovery/migration sign-off recorded
- [ ] Production migration preflight passed
- [ ] Explicit release authorization for live writes
- [ ] New production deployment verified
- [ ] Original site and existing data unchanged

This file is a release plan, **not** evidence that secure live imports are ready or deployed.
