# PeoplePulse production security verification

Reviewed on 22 November 2026 (IST). **Production release is blocked.** This review used the cached management session and a read-only catalog query against the hosted production project. No production settings or SQL migrations were changed.

| Gate | Status | Evidence |
| --- | --- | --- |
| Hosted Auth tenant entry | Passed | Public and anonymous sign-in registration are disabled. Email confirmation is enabled. Password minimum is 8 characters, with lower and upper case letters, digits and symbols required. |
| Production Auth redirects | PASSED | A fresh management read confirms the production origin as both Site URL and sole additional redirect. |
| Leaked-password protection | Blocked | The read-only CLI configuration response did not expose the setting. Verify it in the hosted Auth dashboard and record the result. |
| Hosted schema comparison | Failed | Tables, policies, function bodies and triggers match the six applied migrations. Effective authenticated grants on all 25 public tables are broader than those explicitly defined in the migration files. |
| Atomic imports and approval | Passed in isolated SQL | The candidate removes authenticated table staging, tracks atomic provenance, and prevents advancing unverified legacy batches. Review, approval and publish remain separate. Hosted migrations are pending. |
| Export scope | Passed with synthetic fixtures | Generated CSV, Excel, PDF and print output contains only the selected company. Fresh account scope changes block every format. The test replaces the Auth transport with synthetic role profiles. |
| Vercel Preview authentication | Blocked | Both Supabase variables are Production-only. The Vercel Preview is protected, and the hosted project reports zero preview branches. No approved isolated hosted Supabase configuration was available. |
| Reviewer inspection | BLOCKED for hosted Preview | The additional scoped review migration and UI are included in the candidate. Hosted reviewer testing needs an isolated Preview project. |
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

A fresh read of hosted configuration confirms Site URL and the sole additional redirect both use `https://peoplepulse-hr-dashboard.vercel.app`. The code uses the origin as its password-reset redirect. Leaked-password protection still needs a manual check in **Authentication ? Password Security**. No hosted settings were changed in this review.

## Production approval evidence

The reviewed release is `f3821ee5529b11c9591dccb25e0f8218a0553661`. Draft PR #1 remains open and unmerged, with no review threads returned. CI run 5 passed the disposable PostgreSQL 17 tests and the isolated Auth and Data API workflow. The production domain still points to deployment `dpl_GJSaoL5pW75QmdJBYjdfoRjBwLyd` at `1a0c690`.

| Gate | Status | Evidence or required action |
| --- | --- | --- |
| Production Auth URL configuration | PASSED | Site URL and sole additional redirect are both `https://peoplepulse-hr-dashboard.vercel.app`. |
| Hosted password controls | NOT VERIFIED | Minimum 8 with lowercase, uppercase, digits and symbols. Leaked-password protection requires a dashboard check. Public sign-up and anonymous sign-in remain disabled, and email confirmation is enabled. |
| Isolated hosted Preview | BLOCKED | Only production is visible in project inventory. Approve an empty test project and any associated charges, isolation setup, test identities and branch-only Vercel Preview variables. Keep Preview protection enabled. |
| Independent reviewer inspection | BLOCKED | Test the new scoped, read-only inspection against the approved isolated Preview before import enablement. |
| Production catalog and migration impact | PASSED | Six baseline versions are present. Zero unpublished batches and zero over-limit allocation groups at the time of the audit. The effective Data API schemas are `public` and `graphql_public`. |
| SQL recovery point | BLOCKED | Backup inventory contains zero backups and PITR is disabled. Establish and confirm a usable recovery point, restore procedure and protected destination before requesting SQL execution approval. |
| Production permissions | FAILED | Excess authenticated grants remain until approved migration execution. The reviewed local change removes direct staging and excess privileges. |
| Production SQL execution | REQUIRES APPROVAL | Request approval for the exact three versions below after recovery readiness. No production SQL was written. |
| Release and real Super Admin smoke test | BLOCKED | Deployment approval follows completion of the mandatory gates. Login validation requires the account holder in an authorized browser session. |

### Exact production SQL package

Apply only to `moxnyczdleagujjxwncw` after separate approval. SHA-256 values are from the reviewed Git blobs, in dependency order.

| Version | SHA-256 |
| --- | --- |
| `20261121235346` | `13f064c81f26062b988cc2492b1b66b90c06c0a16ceae9a466f3553a853b3eb9` |
| `20261121235434` | `b53809fecb5c9d592822234f0b5d4742f5e242af74064328784212b81efa791a` |
| `20261122010333` | `6eed1246da6e73f9ec41d168fb154dec259dc2badaaeecb9e34ce88a67e70a35` |

The package does not delete employee or payroll rows. The allocation migration replaces a trigger and can reject newly attempted over-limit allocations. The final migration adds submission provenance and revokes direct writes from applications using the legacy staging path. Ordinary RLS-protected employee, payroll and report reads and Supabase Auth are outside those write changes. The second migration creates the endpoint before the third closes legacy writes, so keep live import actions disabled throughout the cutover. If execution stops partway, inspect installed versions before retrying and seek separate approval for a targeted RPC execute revoke or forward fix. Restore database contents only via an approved recovery procedure. Use Vercel rollback independently for the frontend.

### Reviewer inspection and recovery follow-up

Independent review needs access to the submitted content. The separate candidate `20261122015125_add_scoped_import_review.sql` adds bounded, read-only pages for unpublished atomic batches. It excludes the uploader and requires the applicable import and dataset permissions. Its dedicated role has no login, write grants, or RLS bypass. Normal dashboard and export queries retain their published-row visibility. The original three migration blobs are unchanged. The new migration must be reviewed and approved separately before production application.

[Database recovery plan](database-recovery-plan.md) specifies protected capture, restore and independent verification of Auth, application data, roles, grants, policies and migration history. A source checkpoint and witnessed restore are still blocked.
