import { NextResponse } from 'next/server';
import { envSnapshot, isDebugMode } from '@/lib/debug';
import { requireAdministrator } from '@/lib/auth-helpers';

export async function GET(req: Request) {
  const auth = await requireAdministrator();
  if (auth.errorResponse) return auth.errorResponse;

  if (!isDebugMode(req)) {
    return NextResponse.json({ error: 'Debug mode not active' }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    _debug: {
      env: envSnapshot(),
      nodeVersion: process.version,
      platform: process.platform,
      uptime: `${Math.round(process.uptime())}s`,
    },
  });
}
