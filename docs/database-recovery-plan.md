# PeoplePulse database recovery plan

**Status: DEFERRED — NOT VERIFIED.** The owner deferred backup and restore work during development. The last read-only inventory for `moxnyczdleagujjxwncw` returned zero physical backups, no earliest backup timestamp, and PITR disabled. A verified production checkpoint and independently witnessed restore remain mandatory before production SQL or full release approval.

## Recovery procedure on existing infrastructure

Use an encrypted logical backup from the existing production project and an offline restore rehearsal on existing, authorized infrastructure. Hosted Preview stays disconnected from production. If a managed backup becomes available under the existing plan, record it as additional recovery evidence. [Supabase backups](https://supabase.com/docs/guides/platform/backups) · [Supabase CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

1. The database owner approves the capture window, a restricted encrypted destination outside the shared workspace, and an existing offline restore host. Name a second verifier. Use PostgreSQL 17 tools, a TLS-verified direct or session-mode source connection, and credentials supplied through the owner's vault or protected libpq configuration. Confirm the source project reference and permissions to read all required schemas. The management catalog session alone provides insufficient backup access.
2. Capture application schema and rows in one custom-format archive, with Auth and migration history included. Capture roles and membership separately in the same controlled window. Establish a consistent baseline for verification counts by using an exported read-only snapshot for both the archive and the count manifest, or by coordinating an approved no-write window. Inventory separately managed services, custom Auth and Storage changes, and object contents if used. Confirm schema dependencies against the actual catalog before capture.

   Example for the approved capture host, from its encrypted restricted directory. The libpq service definition and credential lookup must already be set up. Add verified application dependency schemas if the inventory requires them.

   ```text
   pg_dump --dbname=service=peoplepulse-backup-source --format=custom --file=peoplepulse.dump --schema=public --schema=private --schema=auth --schema=supabase_migrations
   pg_dumpall --dbname=service=peoplepulse-backup-source --roles-only --no-role-passwords --file=roles.sql
   pg_restore --list peoplepulse.dump
   ```

   For snapshot mode, pass the still-open source transaction's exported snapshot ID to `pg_dump --snapshot` and obtain counts in that snapshot. Record the checkpoint UTC time, Git revision, versions, archive sizes and SHA-256 hashes in a restricted manifest. Inspect the archive table of contents for data, ACLs, functions, policies, Auth and migration history. Stop if any required item is inaccessible or missing. Restore application-role passwords from the vault only where needed. [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html) · [Supabase Auth user migration](https://supabase.com/kb/troubleshooting/migrating-auth-users-between-projects)
3. On the encrypted, offline restore host, initialize a compatible disposable PostgreSQL 17 and Supabase runtime with its own local keys. Inspect and adapt the roles script for application roles and membership, keeping platform-managed roles owned by the target runtime. Review the archive table of contents before restoration. Preserve application ownership and ACLs and use a reviewed restore list for pre-existing managed objects and Auth data. Configure the target service independently of production and confirm its identity before running `pg_restore --exit-on-error --use-list=<reviewed-list> --dbname=service=peoplepulse-offline-restore peoplepulse.dump`. Keep external network, email delivery and application integrations disabled. Stop on an unexpected restore or integrity error.
4. An operator other than the capture operator independently verifies artifact hashes, compares the restored catalog and snapshot counts, and witnesses Auth and tenant checks on the offline runtime. Use only an authorized verification identity. Record actual recovery time, actual recoverable checkpoint, exceptions, and both operators' sign-off. Securely remove the temporary restored copy under the approved handling policy. A rehearsal with synthetic data can verify mechanics. Production recovery readiness requires a usable production checkpoint and evidence that its restore works.

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
