# Communications upgrade recovery

Production site: `61a15791-b7ec-4746-b495-7772abd22840` (`www.tdusales.com`).

On 2026-10-05, a read-only production audit found one unresolved migration:
`20260824120000_communications_automation_foundation`.
It failed on its first statement (`CREATE TABLE "CommunicationEvent"`) because
the table already existed. Its recorded checksum is
`b3ee9082e2ad54113f22a0e24a190f7463461be487051879bd7ee5520ffcc444`, matching
the historical SQL at commit `248b3470` with Windows line endings.
Applied steps are zero. This obsolete migration is absent from the current
release; every migration currently in `prisma/migrations` is already applied.

A manual production recovery snapshot was created and listed back successfully:
`snap-blue-cell-ajq3hj58`, source branch `br-misty-rain-aj38g9pq`,
2026-10-05 18:15:26 UTC. This verifies snapshot availability, not a restore test.

The personal-access-token connection exposes only `netlifydb_readonly`.
Its recovery attempt was rejected without changing the ledger. After the user
signed into the owner browser session, the production SQL console verified
`netlifydb_owner` and applied a guarded update to only this failure's
`rolled_back_at` timestamp: 2026-10-05 18:23:10.593 UTC. Independent readback
confirmed recovery. No customer data, schema, credentials, or access-control
settings were changed. The normal production migration gate remains enabled.

For any future recurrence, inspect `_prisma_migrations` again and confirm the same single
unresolved failure, checksum, zero steps, first-statement error, absence of the
obsolete migration from the release, and availability of a fresh snapshot.
If any precondition differs, stop and investigate the changed state.

With the verified production `DATABASE_URL` set securely in the environment,
use the repository's Prisma CLI:

```powershell
node node_modules/prisma/build/index.js migrate resolve --rolled-back 20260824120000_communications_automation_foundation
node node_modules/prisma/build/index.js migrate deploy
```

The rollback marker preserves the failed attempt's history. No schema or
customer-data reversal is needed because the first SQL statement failed.
Do not mark it applied, recreate the existing tables, reset the database, or
disable the production migration gate. Verify no unresolved failed rows remain
and that `migrate deploy` reports no pending migrations before publishing.

Release validation: 29 focused communications, AI-persistence, and shipping
tests passed. TypeScript and new-component lint passed. The unified inbox and
screen-two workspace embed same-origin pages; Netlify's frame header is aligned
with Next's `SAMEORIGIN` policy. No live calls, messages, or labels were sent.
