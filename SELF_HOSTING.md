# TDGPT self-hosting

This repository includes a proof-of-concept Docker Compose stack containing:

- the Next.js application on `http://localhost:3000`
- PostgreSQL 16 on a private container network
- Ollama on `http://127.0.0.1:11434`
- automatic schema initialization for a brand-new local database

## Windows prerequisite

Run these commands from **PowerShell as Administrator**, then restart Windows:

```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
wsl.exe --install --distribution Ubuntu-24.04
```

After restarting, install Docker Desktop or Docker Engine inside Ubuntu.

## Configure

Copy `.env.selfhost.example` to `.env.selfhost`. Replace
`SELFHOST_DB_PASSWORD` with a long random value. Do not commit either local
environment file; both are ignored by Git.

## Start

```powershell
docker compose build
docker compose up -d postgres ollama
docker compose exec ollama ollama pull qwen3:4b
docker compose up -d db-init app
docker compose ps
```

On Windows, `scripts/start-selfhost.ps1` starts the stack and keeps WSL alive
in the background. `scripts/stop-selfhost.ps1` cleanly stops the containers and
the Ubuntu distribution.

Install the optional availability watchdog to check the login page every five
minutes and restart WSL/Docker when the app stops responding:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-healthcheck-task.ps1
```

Customize the interval with `-IntervalMinutes`. The watchdog runs only while
the Windows user is signed in and stores no credentials.

The `db-init` service uses `prisma migrate deploy` against the validated
baseline in `prisma/migrations`. The repository's previous incomplete SQL is
preserved for reference in `prisma/legacy-migrations` and is never deployed.

Existing self-host installations originally created with `prisma db push` must
adopt the baseline once before restarting with the new Compose configuration:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/adopt-migration-baseline.ps1
```

The adoption script first creates a backup, requires the live database to match
the Prisma schema exactly, and refuses to replace an unrelated migration
history.

## Create or reset the local administrator

The utility generates a temporary password when `LOCAL_ADMIN_PASSWORD` is not
provided. Run it after building the images:

```powershell
docker compose --env-file .env.selfhost run --rm --entrypoint node db-init scripts/create-local-admin.js
```

To choose the account details, set `LOCAL_ADMIN_EMAIL`, `LOCAL_ADMIN_NAME`, and
optionally `LOCAL_ADMIN_PASSWORD` for that command.

## Verify

```powershell
docker compose exec ollama ollama run qwen3:4b "Reply with: local AI is ready"
docker compose logs --tail=100 app
```

## Back up and restore PostgreSQL

Create a compressed backup in the ignored `backups` directory. Backups older
than 14 days are removed by default:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/backup-selfhost.ps1
```

Choose a different retention window with `-RetentionDays 30`. Keep an encrypted
copy on a second device or trusted off-site destination; the local backup folder
protects against database mistakes but not loss of the PC.

Install a daily Windows scheduled task (2:00 AM, 14-day retention by default):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-backup-task.ps1
```

The task starts and waits for PostgreSQL if necessary. Customize the schedule
with `-Hour`, `-Minute`, and `-RetentionDays`. It runs when the Windows user is
signed in and uses no stored database credentials.

Restoration validates the archive, stops the app, replaces the local database,
and starts the app again. It requires an explicit destructive-action switch:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restore-selfhost.ps1 `
  -BackupPath backups/tdgpt-YYYYMMDD-HHMMSS.dump `
  -ConfirmRestore
```

## Transfer production data into self-hosting

The guarded transfer utility reads production through a read-only `pg_dump`,
loads rows into an isolated migrated candidate database, compares critical row
counts, preserves local password hashes, and only then performs a brief atomic
database swap:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/transfer-production-data.ps1
```

The previous local database is retained under a timestamped `tdgpt_preimport_*`
name for rollback, and the production SQL export remains in the ignored
`backups` directory. Do not commit or share that export because it contains
customer and financial data.

## Optional secure remote access

The `public` Compose profile runs a remotely managed Cloudflare Tunnel. Port
3000 remains bound to localhost and Ollama remains private. In Cloudflare:

1. Create a remotely managed tunnel named `tdgpt`.
2. Add a published application hostname and set its origin service to
   `http://app:3000`.
3. Protect the hostname with a Cloudflare Access policy for your authorized
   users before sharing it.
4. Copy only the tunnel token into `CLOUDFLARE_TUNNEL_TOKEN` in the ignored
   `.env.selfhost` file.
5. Set `SELFHOST_APP_URL` to the final `https://` hostname.
6. Start it with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/enable-cloudflare-tunnel.ps1
```

The regular startup script automatically restarts the tunnel whenever a token
is configured. Treat the tunnel token as a password; anyone holding it can run
the connector, so rotate it immediately if it is exposed.

## Important production work

- Keep route-level authorization checks close to sensitive data in addition to
  the Next.js proxy. High-impact user, settings, financial, payment, campaign,
  AI, Zoho, shipping, messaging, and maintenance handlers now enforce sessions.
- The complete direct-function inventory is classified: 104 of 112 handlers
  enforce staff or administrator sessions, four are Netlify scheduled jobs, and
  four are webhook receivers that fail closed when their configured token is
  missing or invalid.
- Before enabling webhooks, configure long random `ZOHO_WEBHOOK_SECRET`,
  `ZOHO_VOICE_WEBHOOK_SECRET`, and `EASYSHIP_WEBHOOK_SECRET` values. Configure
  the matching provider webhook URL/header; token-based receivers also accept
  the secret as the `token` query parameter.
- Add future schema changes as reviewed Prisma migrations and validate them in
  an isolated database before deployment.
- Schedule `backup-selfhost.ps1`, copy backups to encrypted off-site storage,
  and periodically test restoration.
- Enable the prepared Cloudflare Tunnel profile only after configuring its
  public hostname and Access policy.
- Keep Ollama private; do not expose port 11434 to the public internet.
