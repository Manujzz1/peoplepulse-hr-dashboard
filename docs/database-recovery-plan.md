# PeoplePulse database recovery plan

**Status: BLOCKED.** A fresh read-only inventory for `moxnyczdleagujjxwncw` returned zero physical backups, no earliest backup timestamp, and PITR disabled. No recoverable production checkpoint or independently witnessed restore has been verified.

## Recovery options

1. **Managed backup or PITR.** Obtain the owner's approval for plan changes or charges. Enable a suitable managed option and confirm a usable backup or recoverable timestamp before any migration. Record its identifier, UTC time, source project, retention, recovery point objective and recovery time objective. Verify availability and restore instructions with a second authorized operator. Use a separate protected recovery environment for a rehearsal. [Supabase backups](https://supabase.com/docs/guides/platform/backups) · [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project)
2. **Encrypted logical backup.** If managed recovery is unavailable, obtain approval for a protected capture location, an approved restore target, and access by named operators only. Use the Supabase-supported logical backup workflow with an explicit source connection and a coordinated consistent checkpoint. Capture roles, schema, data, Auth records and customizations, and migration history explicitly. Check actual dump contents before signing off. Plain schema dumps and the default CLI dump exclusions do not meet this requirement. [CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) · [Auth user migration](https://supabase.com/kb/troubleshooting/migrating-auth-users-between-projects)

## Required coverage and protection

| What to preserve | What the independent verifier checks |
| --- | --- |
| Auth users and identities | Recoverable users, linked identities, password-hash records, Auth customizations and role foreign keys. Confirm an authorized test login or reset on the restore target and document whether sessions must be reissued. |
| Application and audit data | Match aggregate table counts and integrity checks at the backup timestamp for organizations, companies, employees, payroll, batches and audit rows. Verify constraints and the expected publication state. |
| Database security | Restore application roles and membership, ownership, RLS flags and policies, grants, functions, triggers, indexes, and required extensions. Compare sanitized catalog snapshots and test permitted and denied tenant access. |
| Migration history | Preserve and compare `supabase_migrations.schema_migrations`. Check version order against Git and record the SHA-256 hashes of the proposed scripts separately. |
| Service configuration | Keep a separately secured record of Auth settings and redirects, API exposure, signing and encryption dependencies, and any Storage object recovery process. Use a secrets vault for credentials. Backup metadata alone cannot recover object contents. |

Encrypt backup contents in transit and at rest. Keep the archive, user data, and connection credentials out of Git, Vercel Preview, CI logs, and the shared workspace. A production-data restore target requires explicit approval and separate access controls. The application Preview remains synthetic-only.

## Release and recovery decision

- A second authorized operator verifies the source and target identities, artifact integrity, restore results, and tenant and Auth controls. Both operators record the approved checkpoint and elapsed restore time.
- If a migration stops partway, keep imports disabled, record the applied versions, and inspect transaction state before retrying. Prefer a reviewed forward fix for a narrow policy or function problem. An approved RPC execute revoke can stop import submissions while retaining batch and audit data.
- Restore a production checkpoint only after separate approval and reconciliation of writes made after the checkpoint. Handle frontend rollback separately using the preceding known-good Vercel deployment.
