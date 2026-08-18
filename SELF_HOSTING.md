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

The `db-init` service uses `prisma db push` only against the isolated local
database. The repository's historical Prisma migrations are incomplete and
must be baselined before they are used for production deployments.

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

Restoration validates the archive, stops the app, replaces the local database,
and starts the app again. It requires an explicit destructive-action switch:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restore-selfhost.ps1 `
  -BackupPath backups/tdgpt-YYYYMMDD-HHMMSS.dump `
  -ConfirmRestore
```

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
- Replace the local database initializer with a baselined migration history.
- Schedule `backup-selfhost.ps1`, copy backups to encrypted off-site storage,
  and periodically test restoration.
- Add Cloudflare Tunnel only after local authentication tests pass.
- Keep Ollama private; do not expose port 11434 to the public internet.
