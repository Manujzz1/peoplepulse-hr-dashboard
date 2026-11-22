# PeoplePulse database recovery plan

**Status: OWNER-REPORTED LOGICAL BACKUP CAPTURED — INDEPENDENT RESTORE NOT VERIFIED.** On 22 November 2026, the owner reported a PostgreSQL 17 custom-format production archive of `public`, `private`, `auth`, and `supabase_migrations`, a `pg_dumpall` globals export without role passwords, passing SHA-256 checksums, and a successful full archive readability check. The owner reports the files are on a dismounted 30 GiB VeraCrypt AES-encrypted volume mapped as P: when mounted. Those files were not accessed or independently checked. The previous managed inventory for `moxnyczdleagujjxwncw` had zero physical backups and PITR disabled.

The capture is a scoped logical database backup. It leaves Supabase platform recovery and a witnessed restore unverified. Leave the backup volume dismounted until separate approval for archival access and the restore rehearsal.

## Workstation inspection

| Resource | Result |
| --- | --- |
| Windows PostgreSQL tools | `psql`, `pg_dump`, `pg_dumpall`, `pg_restore`, and the server executable were absent from PATH. No PostgreSQL installation was found under Program Files and no PostgreSQL service was found. |
| Ubuntu WSL 2 | Ubuntu 26.04 is available. PostgreSQL tools, Docker, Podman and Docker socket were absent. Its virtual filesystem advertises about 954 GiB available, but the WSL backing file is on C:. |
| Windows volume space | C: has about 13 GiB free, D: about 141 GiB, and E: about 154 GiB. BitLocker status queries were denied by Windows, so encryption and suitability remain unverified. |
| Offline restore runtime | No ready PostgreSQL 17 or Supabase container runtime was found. WSL availability alone does not establish encrypted, network-isolated restore capacity. |

## Recovery procedure on existing infrastructure

Use an encrypted logical backup from the existing production project and an offline restore rehearsal on existing, authorized infrastructure. Hosted Preview stays disconnected from production. If a managed backup becomes available under the existing plan, record it as additional recovery evidence. [Supabase backups](https://supabase.com/docs/guides/platform/backups) · [Supabase CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

The capture commands below are retained for an authorized refresh. The next gate for the owner-reported archive is a separately approved restore rehearsal, using an independent encrypted destination. Keep the source archive read-only during the rehearsal.

1. The database owner approves the capture window, a restricted encrypted destination outside the shared workspace, and an existing offline restore host. Name a second verifier. Use PostgreSQL 17 tools, a TLS-verified direct or session-mode source connection, and credentials supplied through the owner's vault or protected libpq configuration. Confirm the source project reference and permissions to read all required schemas. The management catalog session alone provides insufficient backup access.
2. Capture application schema and rows in one custom-format archive, with Auth and migration history included. Capture roles and membership separately in the same controlled window. Establish a consistent baseline for verification counts by using an exported read-only snapshot for both the archive and the count manifest, or by coordinating an approved no-write window. Inventory separately managed services, custom Auth and Storage changes, and object contents if used. Confirm schema dependencies against the actual catalog before capture.

   Run this PowerShell block only on the approved capture host during the approved no-write window. Replace the directory placeholder with a new, access-restricted directory on verified encrypted storage outside this workspace. The protected libpq service `peoplepulse-backup-source` must identify `moxnyczdleagujjxwncw`, use `sslmode=verify-full`, and specify the trusted CA. Prefer the direct host `db.moxnyczdleagujjxwncw.supabase.co:5432` if reachable. For IPv4-only access, verify the exact **Session pooler** host and user for that project in Supabase Connect. Use a protected credential source and avoid putting passwords on command lines. Add verified dependency schemas if the approved inventory requires them. [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres)

   ```powershell
   Set-Location -LiteralPath '<approved-encrypted-capture-directory>'
   $ErrorActionPreference = 'Stop'
   $files = 'peoplepulse.dump', 'roles.sql', 'peoplepulse.toc', 'sha256.csv', 'checkpoint-utc.txt'
   if ($files | Where-Object { Test-Path -LiteralPath $_ }) { throw 'Use a new capture directory.' }
   (Get-Date).ToUniversalTime().ToString('o') | Set-Content -Encoding ascii -LiteralPath 'checkpoint-utc.txt'
   pg_dump --dbname=service=peoplepulse-backup-source --format=custom --file=peoplepulse.dump --schema=public --schema=private --schema=auth --schema=supabase_migrations
   if ($LASTEXITCODE -ne 0) { throw 'Database capture failed.' }
   pg_dumpall --dbname=service=peoplepulse-backup-source --database=postgres --roles-only --no-role-passwords --file=roles.sql
   if ($LASTEXITCODE -ne 0) { throw 'Role capture failed.' }
   pg_restore --list --file=peoplepulse.toc peoplepulse.dump
   if ($LASTEXITCODE -ne 0) { throw 'Archive inventory failed.' }
   Get-FileHash -Algorithm SHA256 -LiteralPath 'peoplepulse.dump','roles.sql','peoplepulse.toc','checkpoint-utc.txt' |
     Select-Object @{Name='File';Expression={Split-Path -Leaf $_.Path}},Hash |
     Export-Csv -NoTypeInformation -LiteralPath 'sha256.csv'
   ```

   For snapshot mode, pass the still-open source transaction's exported snapshot ID to `pg_dump --snapshot` and obtain counts in that snapshot. Record the checkpoint UTC time, Git revision, versions, archive sizes and SHA-256 hashes in a restricted manifest. Inspect the archive table of contents for data, ACLs, functions, policies, Auth and migration history. Stop if any required item is inaccessible or missing. Restore application-role passwords from the vault only where needed. [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html) · [Supabase Auth user migration](https://supabase.com/kb/troubleshooting/migrating-auth-users-between-projects)
3. On the approved encrypted offline host, initialize a clean compatible PostgreSQL 17 and local Supabase Auth/Data API runtime with separate keys. Keep external networking, email delivery, and integrations disabled before loading the archive. Use a loopback or local-socket-only libpq service named `peoplepulse-offline-restore`. Verify its host, database, and runtime identity independently of the capture configuration. Compare the hashes with the separately retained manifest. Obtain dual review of `roles.reviewed.sql` and `restore.reviewed.list` against the raw role inventory, actual archive TOC, and managed schemas on the target. Preserve application ownership, ACLs and memberships. Keep platform-managed roles and pre-existing compatible managed definitions owned by the local platform. Include the application and Auth data, relevant custom Auth objects, and migration history. The reviewed files depend on the archive and cannot be finalized before capture.

   Before allowing the archive onto the host, verify its PostgreSQL data directory, actual `pg_wal` destination, tablespaces, database and operating-system temporary directories, service and container logs, and any container backing storage are encrypted. Check symlink and mount destinations. Keep the libpq service and credential files protected on encrypted storage and prevent plaintext swap, crash dumps, and diagnostic logging from spilling to host disks. Do not use unencrypted C:, D:, or E: or the existing Ubuntu PostgreSQL cluster backed by C:. The SQL identity check below is insufficient by itself to establish encrypted storage.

   ```powershell
   Set-Location -LiteralPath '<approved-encrypted-offline-restore-directory>'
   $ErrorActionPreference = 'Stop'
   $expected = 'peoplepulse.dump','roles.sql','peoplepulse.toc','checkpoint-utc.txt'
   $manifest = @(Import-Csv -LiteralPath 'sha256.csv')
   if ($manifest.Count -ne $expected.Count -or (Compare-Object $expected $manifest.File)) {
     throw 'Backup manifest does not cover the expected files.'
   }
   foreach ($entry in $manifest) {
     if ((Get-FileHash -Algorithm SHA256 -LiteralPath $entry.File).Hash -ne $entry.Hash) {
       throw 'Backup manifest verification failed.'
     }
   }
   psql --no-psqlrc --dbname=service=peoplepulse-offline-restore --command="select current_database(), inet_server_addr(), inet_server_port(), current_setting('server_version');"
   if ($LASTEXITCODE -ne 0) { throw 'Restore target identity check failed.' }
   ```

   The operator and verifier must confirm the output identifies the approved offline restore runtime before running the next block.

   ```powershell
   psql --no-psqlrc --single-transaction --set=ON_ERROR_STOP=1 --dbname=service=peoplepulse-offline-restore --file=roles.reviewed.sql
   if ($LASTEXITCODE -ne 0) { throw 'Role restore failed.' }
   pg_restore --exit-on-error --single-transaction --use-list=restore.reviewed.list --dbname=service=peoplepulse-offline-restore peoplepulse.dump
   if ($LASTEXITCODE -ne 0) { throw 'Archive restore failed.' }
   ```
4. An operator other than the capture operator independently verifies artifact hashes, compares the restored catalog and snapshot counts, and witnesses Auth and tenant checks on the offline runtime. Use only an authorized verification identity. Record actual recovery time, actual recoverable checkpoint, exceptions, and both operators' sign-off. Securely remove the temporary restored copy under the approved handling policy. A rehearsal with synthetic data can verify mechanics. Production recovery readiness requires a usable production checkpoint and evidence that its restore works.

## Required coverage and protection

| What to preserve | What the independent verifier checks |
| --- | --- |
| Auth users and identities | Recoverable users, linked identities, password-hash records, Auth customizations and role foreign keys. Confirm an authorized test login or reset on the restore target and document whether sessions must be reissued. |
| Application and audit data | Match aggregate table counts and integrity checks at the backup timestamp for organizations, companies, employees, payroll, batches and audit rows. Verify constraints and the expected publication state. |
| Database security | Restore application roles and membership, ownership, RLS flags and policies, grants, functions, triggers, indexes, and required extensions. Compare sanitized catalog snapshots and test permitted and denied tenant access. |
| Migration history | Preserve and compare `supabase_migrations.schema_migrations`. Check version order against Git and record the SHA-256 hashes of the proposed scripts separately. |
| Service configuration | Keep a separately secured record of Auth settings and redirects, API exposure, signing and encryption dependencies, and any Storage object recovery process. Use a secrets vault for credentials. Backup metadata alone cannot recover object contents. |

Before sign-off, inventory optional extensions and their exact versions, Vault or encryption-key dependencies, custom Auth and Storage schema objects, Storage buckets and objects, and deployment/runtime configuration such as SMTP, OAuth, cron, webhooks, and Edge Functions if present. Confirm which dependencies are captured, intentionally absent, or recoverable separately. Restore test credentials and signing settings are local to the offline runtime. A passwordless globals export still requires vault-backed recovery of any application-role passwords that need to be recreated.

Encrypt backup contents in transit and at rest. Keep the archive, user data, and connection credentials out of Git, Vercel Preview, CI logs, and the shared workspace. A production-data restore target requires explicit approval and separate access controls. The application Preview remains synthetic-only.

## Release and recovery decision

- A second authorized operator verifies the source and target identities, artifact integrity, restore results, and tenant and Auth controls. Both operators record the approved checkpoint and elapsed restore time.
- If a migration stops partway, keep imports disabled, record the applied versions, and inspect transaction state before retrying. Prefer a reviewed forward fix for a narrow policy or function problem. An approved RPC execute revoke can stop import submissions while retaining batch and audit data.
- Restore a production checkpoint only after separate approval and reconciliation of writes made after the checkpoint. Handle frontend rollback separately using the preceding known-good Vercel deployment.
