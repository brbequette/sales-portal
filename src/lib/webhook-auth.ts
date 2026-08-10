import { NextRequest } from 'next/server';

const WEBHOOK_SECRET = process.env.ZOHO_WEBHOOK_SECRET;

/**
 * Verify Zoho webhook signature.
 * Falls back to checking a shared secret query parameter if no signature header.
 * 
 * Uses Web Crypto API (Edge-compatible) instead of Node.js crypto module.
 */
export function verifyWebhookSignature(req: NextRequest): boolean {
  // Method 1: Check X-Zoho-Signature header (HMAC-SHA256)
  const signature = req.headers.get('x-zoho-signature');
  if (signature && WEBHOOK_SECRET) {
    // Signature verification happens after body parsing via verifyWebhookBody
    return true;
  }
  
  // Method 2: Check shared secret query parameter
  const token = req.nextUrl.searchParams.get('token');
  if (token && WEBHOOK_SECRET && token === WEBHOOK_SECRET) {
    return true;
  }

  // Method 3: Check Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader && WEBHOOK_SECRET) {
    const bearerToken = authHeader.replace('Bearer ', '');
    if (bearerToken === WEBHOOK_SECRET) return true;
  }

  return !WEBHOOK_SECRET; // If no secret configured, allow (dev mode)
}

export async function verifyWebhookBody(req: NextRequest, body: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true; // Dev mode
  
  const signature = req.headers.get('x-zoho-signature');
  if (!signature) return verifyWebhookSignature(req);
  
  // Use Web Crypto API (Edge-compatible) instead of Node.js crypto
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Constant-time comparison
  if (computed.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}
