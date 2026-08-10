import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyWebhookSignature } from '@/lib/webhook-auth';

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  
  // Protect all webhook endpoints
  const isWebhookPath = pathname.startsWith('/api/zoho-sync') || pathname.startsWith('/api/webhooks/');
  
  if (req.method === 'POST' && isWebhookPath) {
    if (!verifyWebhookSignature(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
