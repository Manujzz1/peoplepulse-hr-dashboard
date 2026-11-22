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
| Vercel Preview authentication | NOT VERIFIED | Hosted authentication is intentionally outside the Preview test scope. Preview remains protected and disconnected from production. |
| Reviewer inspection | PASSED in isolation | Scoped reviewer inspection passed SQL and synthetic Auth/Data API checks. Live import actions remain disabled. |
| Production release or SQL execution | Requires approval | Close the failed and blocked gates, confirm a recovery point and review exact migration versions. Live import actions default to disabled. |

## Hosted database comparison

Production runs PostgreSQL 17.12. Its migration history contains `202611160001` through `202611160006`. A catalog comparison found identical names, column types and RLS flags on 25 public tables, 76 policies, nine application functions and two application triggers. All 25 tables have RLS. The comparison includes application function bodies, security mode, search path, and anon and authenticated execution rights.

The authenticated role had extra `TRUNCATE`, `TRIGGER` and `REFERENCES` grants on all 25 public tables and extra write grants on `app_roles` and `role_permissions`. Anonymous table grants matched. The new candidate revokes the excess table privileges and restricts staging to a no-login executor with no RLS bypass. The public RPC remains invoker-only and delegates to the private executor, preserving caller claims and existing policies. Normal authenticated batch writers retain status-only updates subject to the original workflow triggers. Source rows continue to follow unpublished visibility rules.

The following reviewed candidates are absent from production:

- `20261121235346` changes allocation validation to cover staged rows while preserving their read restrictions.
- `20261121235434` creates the public atomic import endpoint.
- `20261122010333` adds `import_batches.atomic_submission`, the provenance trigger, the private executor and a public invoker wrapper. It removes excess grants and direct staging privileges. It blocks pre-cutover batches from advancing while preserving historical Published rows and audit records.
- `20261122015125` adds the scoped read-only reviewer interface and revokes direct writes to import validation issues. The public invoker wrapper delegates to a no-login role subject to dedicated RLS policies, including the independent reviewer and dataset-read checks.

Review the four files in that order. Before applying them, inventory incomplete legacy batches and record the verified backup checkpoint. Keep `private` outside the exposed Data API schemas. Use a separately approved database change for production. Retest grants, trigger timing, approval and publication behavior, and RPC identity after an approved installation. Roll back the frontend independently. If import access needs to be stopped, keep frontend actions disabled and review a separately approved execute revoke. Retain audit events and source records during recovery.

## Hosted Preview assurance boundary

Hosted Preview authentication is **NOT VERIFIED** by release-owner direction. The existing Vercel Preview remains protected and receives no production Supabase variables. Existing isolated PostgreSQL, synthetic Supabase Auth/Data API, unit and browser suites provide the regression evidence. They leave residual risk in the hosted browser integration, including Vercel build-time variables, redirect behavior, email recovery, and browser session restoration. Capture explicit acceptance of that residual risk in the release approval. After an approved deployment, the existing Super Admin must verify login, reload, logout and role scope in production without test-data writes before confidential use.

## Production Auth approval

A fresh read of hosted configuration confirms Site URL and the sole additional redirect both use `https://peoplepulse-hr-dashboard.vercel.app`. The code uses the origin as its password-reset redirect. Leaked-password protection still needs a manual check in **Authentication ? Password Security**. No hosted settings were changed in this review.

## Production approval evidence

Draft PR #1 remains open and unmerged. At the reviewed code commit `c0d9f0e`, CI run 7 passed 109 SQL assertions on PostgreSQL 17, the isolated Auth and Data API workflow, 162 unit tests, four browser tests, lint and build. The production domain still points to deployment `dpl_GJSaoL5pW75QmdJBYjdfoRjBwLyd` at `1a0c690`.

| Gate | Status | Evidence or required action |
| --- | --- | --- |
| Production Auth URL configuration | PASSED | Site URL and sole additional redirect are both `https://peoplepulse-hr-dashboard.vercel.app`. |
| Hosted password controls | NOT VERIFIED | Minimum 8 with lowercase, uppercase, digits and symbols. Leaked-password protection requires a dashboard check. Public sign-up and anonymous sign-in remain disabled, and email confirmation is enabled. |
| Hosted Preview authentication | NOT VERIFIED | Preview stays disconnected from production. Hosted browser integration remains a documented release risk. |
| Independent reviewer inspection | PASSED in isolation | CI verified the scoped inspection endpoint with synthetic authenticated users. Production import enablement requires separate approval. |
| Production catalog and migration impact | PASSED | Six baseline versions are present. Zero unpublished batches and zero over-limit allocation groups at the time of the audit. The effective Data API schemas are `public` and `graphql_public`. |
| SQL recovery point | DEFERRED — NOT VERIFIED | The owner deferred backup and restore work during development. A usable checkpoint and independently witnessed restore remain mandatory before production SQL or full release approval. |
| Production permissions | FAILED | Excess authenticated grants remain until approved migration execution. The reviewed local change removes direct staging and excess privileges. |
| Production SQL execution | REQUIRES APPROVAL | Request approval for the exact four versions below after recovery readiness. No production SQL was written. |
| Release and real Super Admin smoke test | BLOCKED | Deployment approval follows completion of the mandatory gates. Login validation requires the account holder in an authorized browser session. |

### Exact production SQL package

Apply only to `moxnyczdleagujjxwncw` after separate approval. SHA-256 values are from the reviewed Git blobs, in dependency order.

| Version | SHA-256 |
| --- | --- |
| `20261121235346` | `13f064c81f26062b988cc2492b1b66b90c06c0a16ceae9a466f3553a853b3eb9` |
| `20261121235434` | `b53809fecb5c9d592822234f0b5d4742f5e242af74064328784212b81efa791a` |
| `20261122010333` | `6eed1246da6e73f9ec41d168fb154dec259dc2badaaeecb9e34ce88a67e70a35` |
| `20261122015125` | `066ab026f438f9ae65b328cbbd04cea4a3dcd6147574899bb56770435a5b1fb9` |

The package does not delete employee or payroll rows. The allocation migration replaces a trigger and can reject newly attempted over-limit allocations. The third migration adds submission provenance and revokes direct writes from applications using the legacy staging path. The fourth migration adds bounded reviewer-only SELECT policies and a no-login, no-RLS-bypass reader role. It revokes direct writes to validation issues and leaves ordinary dashboard SELECT policies intact. Ordinary RLS-protected employee, payroll and report reads and Supabase Auth are outside those write changes. The second migration creates the endpoint before the third closes legacy writes, so keep live import actions disabled throughout the cutover. If execution stops partway, inspect installed versions before retrying and seek separate approval for a targeted RPC execute revoke or forward fix. Restore database contents only via an approved recovery procedure. Use Vercel rollback independently for the frontend.

### Reviewer inspection and recovery follow-up

Independent review needs access to the submitted content. The separate candidate `20261122015125_add_scoped_import_review.sql` adds bounded, read-only pages for unpublished atomic batches. It excludes the uploader and requires the applicable import and dataset permissions. Its dedicated role has no login, write grants, or RLS bypass. Normal dashboard and export queries retain their published-row visibility. The original three migration blobs are unchanged. The new migration must be reviewed and approved separately before production application.

[Database recovery plan](database-recovery-plan.md) specifies protected capture, restore and independent verification of Auth, application data, roles, grants, policies and migration history. Recovery is **DEFERRED — NOT VERIFIED** and remains a mandatory production release requirement.
