# Temporary ADTL sample records

The sample generator uses the existing 120 fictional employees and January–December 2025. Payroll, attendance, leave, performance and project allocations are generated for employees active at each month end. Values are fictional and must not be used as ADTL reporting. The dashboard and CSV, Excel, PDF and print exports mark affected data **Temporary Sample Data**. Production import controls stay disabled.

`node scripts/adtl-sample-seed.mjs seed` emits reviewed SQL for an authorized database owner. It checks the exact ADTL company key, name and INR currency, takes short-lived write-blocking locks for the inventory check, and aborts if ADTL already has data in any affected source table. It uses the existing owner-seeded reference-row policy. It does not change roles, policies, employee records already present, or the import workflow.

The seed sets a versioned inventory in ADTL's existing application settings table. Each inserted UUID and full-row fingerprint is recorded. A second matching seed is a no-op. Prefixes mark fictional people and reference codes. They are not cleanup selectors.

`node scripts/adtl-sample-seed.mjs cleanup` emits a separate transaction for explicit, authorized removal. It verifies the exact inventory before deleting only those company-scoped UUIDs in reverse dependency order, then removes the inventory. Changed, missing or additional rows cause the transaction to abort, and foreign-key dependencies prevent removing a record reused elsewhere. Perform cleanup before onboarding genuine ADTL data. Keep the list of inserted counts and the deployment SHA with the release record.
