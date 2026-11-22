# PeoplePulse recovery status

## Recovered worktree

Local and GitHub `main` resolve to `1a0c690`. The index was empty. The recovered worktree contains 19 modified tracked files plus untracked application modules, tests, administrative SQL, and release documents. Agent skills and their lockfile are local tooling. The release candidate should exclude those files, environment files, Supabase CLI state, build and test artifacts, and employee data.

The interrupted session appears to have reached integration and release preparation. The worktree contains tenant-scoped live reads, session and permission refresh, staged atomic import submission, fresh live export snapshots, a Windows Playwright runner, code splitting, and a 70-assertion RLS suite. The administrative RPC already had row and JSON size limits, allowlists and a server-generated digest. The existing RPC review described an earlier draft and needed reconciliation.

The starting snapshot passed 152 unit tests, lint and the production build. The build emitted large ExcelJS chunks for the page and XLSX worker. The SQL draft had validation issues to correct before testing. Database execution, hosted Auth settings, authenticated live dashboards, and real Super Admin verification remained open.

See [deployment readiness](deployment-readiness.md) for test evidence, release gates and the release procedure. See [RPC security review](rpc-security-review.md) for the database contract and remaining verification.

## Completed during recovery

- Hardened the administrative RPC's JSON type order, JWT expiry check, UTF-8 limits, server-side digest, row-month consistency and employee references. Added an isolated 19-assertion PostgreSQL test suite.
- Fixed Employee History cost-centre and manager mapping, stable pagination, company-scoped completeness and cross-company employee/project identity collisions. Preserved password recovery when Auth refreshes a token.
- Updated CI to run the two disposable database suites and let the Playwright runner manage its own server.
- Reran 155 unit tests, four browser tests, lint, build and Git diff checks successfully. No database assertions executed.
- Read-only hosted checks confirmed GitHub and Vercel's baseline, SPA routing and two expected production environment names. Hosted public sign-up was enabled, which fails the release gate. Anonymous sign-in was disabled and email autoconfirm was disabled.
- Both SQL runtime suites, the full hosted Auth configuration, the real Super Admin session, authenticated queries/exports and the reviewer workflow remain release blockers. The worktree remains unstaged and the production deployment still serves the prior commit.
