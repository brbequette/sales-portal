// ─── Server-Side Debug Utilities ─────────────────────────────────────────────
// Zero-overhead when debug mode is off. Import in any API route.

import type { NextRequest } from 'next/server';

/**
 * Check if debug mode is active.
 * Sources (any one triggers it):
 * 1. `?debug=1` query parameter on the request
 * 2. `DEBUG_MODE=true` environment variable
 */
export function isDebugMode(req?: NextRequest | Request): boolean {
  // Env var check
  if (process.env.DEBUG_MODE === 'true' || process.env.DEBUG_MODE === '1') {
    return true;
  }

  // URL param check
  if (req) {
    try {
      const url = new URL(req.url);
      if (url.searchParams.get('debug') === '1') return true;
    } catch {}
  }

  return false;
}

/**
 * Wraps an API response with optional debug payload.
 * When debugInfo is null/undefined, returns data unchanged (zero overhead).
 */
export function debugResponse<T extends Record<string, any>>(
  data: T,
  debugInfo: Record<string, any> | null | undefined
): T & { _debug?: Record<string, any> } {
  if (!debugInfo) return data;
  return { ...data, _debug: debugInfo };
}

/**
 * Creates a timing tracker for measuring operation durations in API routes.
 *
 * Usage:
 *   const timer = debugTimer();
 *   // ... do work ...
 *   timer.mark('db_query');
 *   const results = await prisma.findMany(...);
 *   timer.mark('db_done');
 *   return { timing: timer.summary() };
 */
export function debugTimer() {
  const start = Date.now();
  const marks: { label: string; time: number }[] = [];

  return {
    mark(label: string) {
      marks.push({ label, time: Date.now() });
    },
    summary() {
      const totalMs = Date.now() - start;
      const segments: Record<string, string> = {};

      for (let i = 0; i < marks.length; i++) {
        const prev = i === 0 ? start : marks[i - 1].time;
        segments[marks[i].label] = `${marks[i].time - prev}ms`;
      }

      return {
        total: `${totalMs}ms`,
        ...segments,
      };
    },
  };
}

/**
 * Formats any error into a debug-friendly object with stack trace.
 */
export function formatDebugError(error: unknown): Record<string, any> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 10).map(l => l.trim()),
      ...(error as any).code ? { code: (error as any).code } : {},
      ...(error as any).status ? { status: (error as any).status } : {},
    };
  }
  return { message: String(error) };
}

/**
 * Returns a snapshot of which critical env vars are present (not their values).
 * Safe to include in debug responses — never leaks secrets.
 */
export function envSnapshot(): Record<string, boolean> {
  const keys = [
    'DATABASE_URL',
    'OPENAI_API_KEY',
    'EASYSHIP_API_KEY',
    'ZOHO_CLIENT_ID',
    'ZOHO_CLIENT_SECRET',
    'ZOHO_REFRESH_TOKEN',
    'ZOHO_ORGANIZATION_ID',
    'NEXTAUTH_SECRET',
    'ZOHO_VOICE_FROM_NUMBER',
    'ZOHO_VOICE_WEBHOOK_SECRET',
    'COMPANY_NAME',
  ];

  const snapshot: Record<string, boolean> = {};
  for (const key of keys) {
    snapshot[key] = !!process.env[key];
  }
  return snapshot;
}
