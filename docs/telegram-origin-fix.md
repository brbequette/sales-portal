# Telegram pairing origin validation

Pairing and disconnect validate the browser Origin against the exact configured HTTPS TELEGRAM_PUBLIC_ORIGIN, rather than the proxy-dependent server URL. Missing or malformed configuration and foreign origins fail closed. Existing session and pairing authorization are unchanged.

Validation: four standalone origin tests pass locally. Full local dependency installation was blocked by insufficient disk space. The Telegram CI workflow runs the existing Telegram tests, TypeScript and focused lint. Production acceptance remains pending.
