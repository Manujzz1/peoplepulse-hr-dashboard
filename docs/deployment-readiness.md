# PeoplePulse deployment readiness

Verified on 22 November 2026 (India Standard Time).

## Deployed sign-in diagnosis

The live domain serves deployment `dpl_GJSaoL5pW75QmdJBYjdfoRjBwLyd` from 17 November 2026, at commit `1a0c690`. GitHub `main` matches that commit. The local release branch and draft PR #1 are based on release candidate `316104a`. The deployed source expects `VITE_SUPABASE_ANON_KEY`, and its served JavaScript contains neither the expected Supabase project URL nor a publishable key. The sign-in gate appears before a request reaches Supabase.

The two current Production variables were added on 20 November 2026. Both are nonempty and match the local pair. The URL targets `moxnyczdleagujjxwncw`, and the publishable key returned HTTP 200 from the project's public Auth settings endpoint. The worktree reads the matching `VITE_SUPABASE_PUBLISHABLE_KEY` name. A fresh Vercel production build from an approved commit containing the fix is required. Redeploying the old commit with the current variable names would leave the key name mismatch. [Vite build-time environment variables](https://vite.dev/guide/env-and-mode) · [Vercel environment variables](https://vercel.com/docs/environment-variables)

The local build rejects partial or invalid Supabase configuration and refuses completely absent configuration when `VERCEL_ENV=production`. Confirm **Automatically expose System Environment Variables** in the existing Vercel project so the production-only check runs. A local or preview demo build can still leave both variables blank. [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)

### Safe release sequence

1. Obtain commit approval. Use the existing local branch `release/peoplepulse-auth-config`. Review `git status --short` and `git diff`. Stage only the approved paths with `git add -- <paths>`. Keep local environment files, build output, reports, agent tooling and the production bootstrap SQL out of the commit. Review the staged patch with `git diff --cached --check` and `git diff --cached` before committing.
2. Obtain push approval and approval for any automatic Vercel Preview build it will trigger. Run `git push -u origin release/peoplepulse-auth-config`. Update existing draft PR #1 and wait for full CI on its new head. Confirm Vercel Deployment Protection is active, check that Preview targets the approved release SHA, and verify its environment scope excludes production credentials and production HR data. Record hosted Preview authentication as NOT VERIFIED and use the isolated Auth/Data API workflow as regression evidence.
3. Close the remaining gates in [final security verification](final-security-verification.md). Verify the hosted Auth password and redirect controls, full isolated Supabase RLS/RPC suites, reviewer access and legacy staging, and authenticated dashboard and export behavior. Keep production SQL execution on its separate approval path. If database changes are pending, keep live imports unavailable.
4. Obtain explicit production deployment approval before merging the PR or pushing to `main`, since Vercel may deploy automatically. Confirm the existing Vercel project, the `main` commit, the Production variables, and a fresh `npm run build` into `dist`. Verify the production URL serves that new commit and presents the organisation sign-in form. Have the account holder sign in as the existing Super Admin and verify organization scope, refresh and logout before using confidential data.

## Release gates

### Production approval checklist

- [x] Verify the production Site URL and sole additional redirect are both `https://peoplepulse-hr-dashboard.vercel.app`.
- [x] Leaked-password protection is **ENABLED — OWNER CONFIRMED**.
- [x] Retain the isolated PostgreSQL, synthetic Auth/Data API, unit and browser verification. Hosted Preview authentication is **NOT VERIFIED** and the owner acknowledged the residual risk. Keep Preview protected and disconnected from production.
- [ ] **OWNER-REPORTED BACKUP CAPTURED. INDEPENDENT RESTORE NOT VERIFIED.** Obtain independent sign-off on the recovery point before production SQL, merge, or full deployment. [Database recovery procedure](database-recovery-plan.md)
- [ ] Recheck the [four migration checksums and preflight](final-security-verification.md) before requesting authorization for the exact files in dependency order. Check installed versions, grants and both RPCs after any separately approved application.
- [ ] Record the exact reviewed PR head and green checks, branch protection and review status, and the recorded acknowledgment of the hosted Preview residual risk. Obtain explicit approval to merge and deploy that revision.
- [ ] Verify the deployed commit and Production Supabase configuration. Have the existing Super Admin verify login, refresh, organization scope and logout. If Auth or access checks fail, withhold confidential use and follow rollback.
- [ ] Keep production live imports disabled. Any enablement needs separate approval and is outside the frontend release.

### Rollback procedure

If the frontend smoke test fails, stop rollout and promote the preceding known-good production deployment through the existing Vercel project after approval. The pre-release deployment observed during this review is `dpl_GJSaoL5pW75QmdJBYjdfoRjBwLyd` at `1a0c690`. It is a fallback for the existing site shell and has the prior sign-in configuration mismatch. Confirm the active rollback target and its limitations at release time.

If a database migration fails, keep imports disabled, record the versions that actually committed, and diagnose from that state. The atomic submit endpoint appears before the staging restriction migration, so a partial cutover calls for immediate review of that execute grant. Seek separate approval for a targeted revoke or a reviewed forward fix. Database restore has its own authorization and reconciliation steps. [Database recovery procedure](database-recovery-plan.md)

| Gate | Status | Evidence |
| --- | --- | --- |
| Unit tests | PASS | See the latest passing CI run on draft PR #1 for the current count. |
| Browser tests | PASS | Four tests passed. Synthetic Chromium coverage for the sign-in gate, navigation, filtering, search, CSV and XLSX import preview, report downloads, mobile layout and browser errors. |
| Lint | PASS | Local Oxlint exited successfully. Git diff whitespace checks also passed. |
| Production build | PASS | Vite generated `dist` with the expected project URL and publishable key. Chrome rendered the email and password form from the compiled build. A production-mode build with both variables missing failed as intended. Vite reported the two lazy ExcelJS chunks of about 929 kB and 932 kB. |
| Runtime RLS | PASS | 73 of 73 assertions passed in disposable embedded PostgreSQL 18.7. Full isolated Supabase verification passed in GitHub CI. |
| SQL RPC runtime | PASS | 36 of 36 RPC assertions passed in isolated Supabase CI, including scoped reviewer access. |
| Hosted Auth configuration | PASSED | Site URL and sole redirect match production. Public sign-up and anonymous sign-in are disabled. Leaked-password protection is ENABLED — OWNER CONFIRMED. |
| Existing Super Admin login | NOT VERIFIED | Requires the account holder to authenticate in the browser. |
| Live dashboard queries | NOT VERIFIED | Unit tests use mocked clients. Authenticated reads, KPI reconciliation and the full filter matrix still need isolated data. |
| Import security | PASSED in isolation | PostgreSQL and the synthetic Auth/Data API workflow verify atomic staging and scoped independent inspection. Live import actions remain disabled. |
| Export security | NOT VERIFIED | Client and demo checks passed. Authenticated role, payroll and tenant checks remain open. |
| Secrets review | PASS | No privileged Supabase credential was detected in scanned frontend bundles or branch history. The CI log scan found an isolated loopback runner key. Local CI hardening suppresses the startup banner and requires verification on the next authorized push. Production environment values were excluded from the scan. |
| GitHub readiness | PASS | Draft PR #1 targets `main`. No effective main-branch rules were reported. Establish or explicitly review the repository controls before merge. Use the exact PR head SHA and passing CI for approval. |
| Vercel readiness | FAIL | Production still serves the old build without working Auth configuration. The current Production URL and publishable key were validated. A new approved deployment is required. |
| Production RPC approval | BLOCKED | The four candidates passed isolated SQL tests. Recovery preparation has resumed. A verified restore and separate explicit approval are required. |

The candidate is withheld from production deployment and confidential HR or payroll use pending these gates.

## 1. Run isolated database tests

On Windows, start a Docker-compatible container engine. The current CLI is Supabase 3.2.0. `supabase start` failed with `DockerLifecycleInspectError` because Docker and Podman were missing. WSL was denied inside the sandbox. An approved check outside the sandbox found Ubuntu on WSL 2, without Docker, Podman, PostgreSQL or pgTAP commands. Ubuntu sudo required interactive authentication. No local PostgreSQL listener was found and the test runner reported `ECONNREFUSED 127.0.0.1:54322`. Enabling missing Windows virtualization or WSL features may require an administrator. GitHub Actions on Ubuntu can run the same disposable stack on an approved PR. This release uses the existing isolated CI stack.

From a checkout with a disposable local stack, run these commands in PowerShell. Verify that each database command identifies the local target. Stop if a command fails.

```powershell
$env:SUPABASE_HOME = Join-Path $env:TEMP 'peoplepulse-supabase-cli-home'
$env:SUPABASE_TELEMETRY_DISABLED = '1'
supabase.exe start
supabase.exe test db supabase/tests/peoplepulse_rls_test.sql
supabase.exe test db supabase/tests/peoplepulse_import_rpc_test.sql
supabase.exe stop
```

The six baseline migrations, the four migration candidates, and the synthetic seed load into the local stack. Each pgTAP suite creates its own synthetic Auth fixtures in a transaction and rolls back. Use the local target throughout. The CI job applies all four candidates when creating the disposable stack. See [final security verification](final-security-verification.md) for the embedded test results and reproduction steps. See [Supabase local database testing](https://supabase.com/docs/guides/local-development/cli/testing-and-linting).

## 2. Verify hosted Auth and the existing account

1. In Supabase Dashboard, select project `moxnyczdleagujjxwncw`. In **Authentication → Providers / Sign In**, keep public sign-up and anonymous sign-in disabled. Open the Email provider and confirm email confirmation is enabled.
2. The owner confirmed leaked-password protection is enabled. Recheck the observed password policy against the approved rules at release time.
3. In **Authentication → URL Configuration**, check Site URL `https://peoplepulse-hr-dashboard.vercel.app` and the exact production root entry for password reset. The app requests a redirect to the current origin. Use only the exact `http://localhost:5173` origin if that development callback is approved. Review the full redirect list and email recovery template for broad patterns or hardcoded destinations. See [Supabase redirect URL rules](https://supabase.com/docs/guides/auth/redirect-urls).
4. In a private browser window, sign in directly to the existing site using the existing Super Admin account. Confirm the expected production organization, the expected `super_admin` assignment, authorized navigation and the live empty state where applicable. Reload the same tab, confirm persistence, sign out and reload a deep link to check the sign-in gate. Record the result without copying credentials, tokens, or HR records.
5. In the existing disposable local or CI stack use synthetic identities to verify the complete reset flow, expired/revoked sessions, cross-role and cross-tenant behavior, and direct navigation. Use the same browser tab for PKCE recovery. Repeat the production account smoke check on the approved release.

## 3. Review and release

1. Review [RPC security findings](rpc-security-review.md), require successful tests and verify the isolated Auth workflow using distinct synthetic uploader, reviewer and approver accounts plus a publisher with the required permission. Check that staged data stays hidden before publication and reconciles after publication. Run the six modules against RLS-protected synthetic records and reconcile headcount, exits, attrition, attendance, payroll, recruitment, allocation and employee costs with the seeded totals. Compare organization, company, department, location, month and financial-year filters, search, table navigation, refresh and unavailable states. Exercise CSV, XLSX, PDF and print under authorized, restricted and expired sessions.
2. Review `git status --short`, `git diff`, `git diff --cached` and `git diff --check`. Explicitly stage intended source, tests, SQL, CI and documentation only. Review `git diff --cached` again. Exclude `.agents/`, `skills-lock.json`, environment files, `supabase/.temp/`, `dist/`, `test-results/` and confidential data. With explicit approval, commit the reviewed files and push a review branch. Verify the GitHub commit and CI result.
3. In Vercel project **Settings → Git**, confirm the linked repository is `Manujzz1/peoplepulse-hr-dashboard` and production branch is `main`. Under **Build and Deployment**, check the repository root, build command `npm run build` and output `dist`. The hosted deployment metadata reports an unset framework preset. The checked-in `vercel.json` provides SPA rewrites.
4. Under **Settings → Environment Variables**, confirm `VITE_SUPABASE_URL` points to `https://moxnyczdleagujjxwncw.supabase.co` and `VITE_SUPABASE_PUBLISHABLE_KEY` is the corresponding public client key. Verify the settings privately. Keep those variables scoped to Production. A push or merge to the connected production branch can initiate a deployment, so obtain deployment approval before that step.
5. After independent recovery sign-off and completion of the security gates, obtain separate approval for applying the four reviewed migrations to the specific production project. Verify function signatures, invoker security, grants, underlying policies and migration records. Obtain separate approval for merging PR #1 and promoting the production frontend. Keep live import actions disabled.
6. After release, check the production URL, SPA deep links, sign-in, session restoration, role-visible dashboards, sign-out and filtered exports. Perform an authorized import smoke test with synthetic records only in an isolated environment. Verify production import actions remain disabled.

## Rollback

Promote the preceding known-good deployment from Vercel **Deployments** after verifying its commit. The observed baseline is `dpl_GJSaoL5pW75QmdJBYjdfoRjBwLyd` at `1a0c690`. Verify sign-in and smoke checks after promotion.

Handle SQL rollback independently. Pause import traffic, inspect the deployed migration and batch/audit state, and obtain database approval for the exact remediation. If disabling the RPC is needed, review a targeted revoke of `EXECUTE` and preserve committed rows and RLS. If the migration fails, confirm transaction state before retrying.
