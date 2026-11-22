# PeoplePulse production security verification

Reviewed on 22 November 2026 (IST). **Production release is blocked.** This review used the cached management session and a read-only catalog query against the hosted production project. No production settings or SQL migrations were changed.

| Gate | Status | Evidence |
| --- | --- | --- |
| Hosted Auth tenant entry | Passed | Public and anonymous sign-in registration are disabled. Email confirmation is enabled. Password minimum is 8 characters, with lower and upper case letters, digits and symbols required. |
| Production Auth redirects | Failed | Site URL is `http://localhost:3000`. The additional redirect allowlist is empty. |
| Leaked-password protection | Blocked | The read-only CLI configuration response did not expose the setting. Verify it in the hosted Auth dashboard and record the result. |
| Hosted schema comparison | Failed | Tables, policies, function bodies and triggers match the six applied migrations. Effective authenticated grants on all 25 public tables are broader than those explicitly defined in the migration files. |
| Atomic imports and approval | Passed in isolated SQL | The candidate removes authenticated table staging, tracks atomic provenance, and prevents advancing unverified legacy batches. Review, approval and publish remain separate. Hosted migrations are pending. |
| Export scope | Passed with synthetic fixtures | Generated CSV, Excel, PDF and print output contains only the selected company. Fresh account scope changes block every format. The test replaces the Auth transport with synthetic role profiles. |
| Vercel Preview authentication | Blocked | Both Supabase variables are Production-only. The Vercel Preview is protected, and the hosted project reports zero preview branches. No approved isolated hosted Supabase configuration was available. |
| Reviewer inspection | Blocked | The approval workflow and tenant denial are testable in local SQL and the synthetic API workflow. The app presents batch metadata. Independent inspection of unpublished row contents still needs a separately reviewed, scoped interface if required for operational approval. |
| Production release or SQL execution | Requires approval | Close the failed and blocked gates, confirm a recovery point and review exact migration versions. Live import actions default to disabled. |

## Hosted database comparison

Production runs PostgreSQL 17.12. Its migration history contains `202611160001` through `202611160006`. A catalog comparison found identical names, column types and RLS flags on 25 public tables, 76 policies, nine application functions and two application triggers. All 25 tables have RLS. The comparison includes application function bodies, security mode, search path, and anon and authenticated execution rights.

The authenticated role had extra `TRUNCATE`, `TRIGGER` and `REFERENCES` grants on all 25 public tables and extra write grants on `app_roles` and `role_permissions`. Anonymous table grants matched. The new candidate revokes the excess table privileges and restricts staging to a no-login executor with no RLS bypass. The public RPC remains invoker-only and delegates to the private executor, preserving caller claims and existing policies. Normal authenticated batch writers retain status-only updates subject to the original workflow triggers. Source rows continue to follow unpublished visibility rules.

The following reviewed candidates are absent from production:

- `20261121235346` changes allocation validation to cover staged rows while preserving their read restrictions.
- `20261121235434` creates the public atomic import endpoint.
- `20261122010333` adds `import_batches.atomic_submission`, the provenance trigger, the private executor and a public invoker wrapper. It removes excess grants and direct staging privileges. It blocks pre-cutover batches from advancing while preserving historical Published rows and audit records.

Review the three files in that order. Before applying them, inventory incomplete legacy batches and record the current backup or point-in-time recovery marker. Keep `private` outside the exposed Data API schemas. Use a separately approved database change for production. Retest grants, trigger timing, approval and publication behavior, and RPC identity after an approved installation. Roll back the frontend independently. If import access needs to be stopped, keep frontend actions disabled and review a separately approved execute revoke. Retain audit events and source records during recovery.

## Preview setup and verification

1. **Approval required** to create and pay for an empty Supabase test project, or explicitly select a separately approved existing isolated project. Prefer a distinct project for full separation. A Supabase preview branch is another option only after confirming its isolation and costs. Leave the Vercel project and its deployment protection in place. [Supabase Branching](https://supabase.com/docs/guides/deployment/branching)
2. **Approval required** to apply only the reviewed migrations and seed synthetic data on the verified test project reference. Use two synthetic organizations and controlled test identities for uploader, reviewer, approver, publisher, outsider and unassigned roles. Keep public sign-up and anonymous sign-in disabled on the test project. Provision test identities through its Auth administration screen.
3. **Approval required** to set the test project's Auth Site URL to the exact protected release Preview origin and add only that trusted callback origin. In Vercel, scope `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to **Preview** and the branch `release/peoplepulse-auth-config`. Use the isolated pair. A test-only `VITE_ENABLE_LIVE_IMPORTS=true` requires approval on that same isolated branch scope. Leave it unset or false for Production. Verify the resulting Preview commit and keep Vercel SSO protection. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
4. In a protected Preview browser session, test password login, same-tab reload and session restoration, organization access, unauthorized and unassigned accounts, logout, and the approved reset callback. With synthetic fixtures, verify uploader self-review denial, independent review and approval, publisher-only publication, and visibility only after publishing. Verify company- and role-scoped CSV, Excel, PDF, and print. Test access removal between loading a report and exporting.
5. No hosted project, branch, test user, redirect, or Vercel variable is created by the local and CI test scripts.

## Production Auth approval

In the existing Supabase project, approve correcting **Authentication → URL Configuration → Site URL** to `https://peoplepulse-hr-dashboard.vercel.app`, and approving the exact production reset origin in the allowlist. Include `http://localhost:5173/**` only if explicitly approved for this hosted project. Under **Authentication → Password Security**, record leaked-password protection and review the observed minimum length and character policy with the security owner. Keep public sign-up and anonymous sign-in disabled. Use the existing Super Admin to verify production authentication separately before any confidential data use. [Supabase password security](https://supabase.com/docs/guides/auth/password-security)
