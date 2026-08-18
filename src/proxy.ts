import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken, encode } from 'next-auth/jwt';
import { isAdminRole } from '@/lib/roles';

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',
  '/shop',
  '/catalog',
  '/about',
  '/contact',
  '/resources',
  '/blade-finder',
  '/applications',
  '/signature-series',
  '/knowledge-test',
  '/rpm-calculator',
  '/blade-comparator',
  '/unit-converter',
  '/tools',
  '/training',
  '/careers',
  '/admin-login',
  '/employee-login',
  '/customer-portal',
  '/privacy',
  '/terms',
  '/login',
  '/intro-offer',
  '/rep-portal',
];

// Static file patterns to always skip
const SKIP_PATTERNS = [
  '/_next/',
  '/favicon',
  '/icon-',
  '/apple-touch-icon',
  '/manifest.json',
  '/sw.js',
  '/tv',
  '/print/',
  '/vcard/',
];

// API routes that don't require authentication
const PUBLIC_API_PATTERNS = [
  '/api/auth/',      // NextAuth routes + magic link
  '/api/webhooks/',  // Webhook endpoints (use their own token auth)
  '/api/public/',    // Explicitly public endpoints
  '/api/customer/',  // Customer portal endpoints (use their own JWT auth)
];

// API routes that require admin role
const ADMIN_API_PATTERNS = [
  '/api/admin/',
  '/api/run-sql',
  '/api/run-db-push',
];

function isPublicRoute(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_ROUTES.some(route => 
    route !== '/' && (pathname === route || pathname.startsWith(route + '/'))
  );
}

function shouldSkip(pathname: string): boolean {
  return SKIP_PATTERNS.some(p => pathname.startsWith(p));
}

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PATTERNS.some(p => pathname.startsWith(p));
}

function isAdminApi(pathname: string): boolean {
  return ADMIN_API_PATTERNS.some(p => pathname === p || pathname.startsWith(p));
}

const AUTH_SECRET = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  console.error('[proxy] NEXTAUTH_SECRET is not set — sessions will not be verifiable');
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  
  // Allow an explicitly enabled E2E bypass only in non-production builds.
  // Localhost alone is not a security boundary: browsers and reverse proxies
  // can still send attacker-controlled requests to a local service.
  const host = req.headers.get('host') || '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const isE2eBypassEnabled = process.env.NODE_ENV !== 'production'
    && process.env.AUTH_E2E_BYPASS_ENABLED === 'true';
  const hasBypassHeader = req.headers.get('x-bypass-auth') === 'true';
  const hasBypassCookie = req.cookies.get('next-auth.session-token')?.value.startsWith('test-token-manager-bypass') || false;
  const isBypassRequest = isE2eBypassEnabled
    && isLocal
    && (hasBypassHeader || hasBypassCookie || req.nextUrl.searchParams.get('bypass') === 'true');

  if (isBypassRequest) {
    const res = NextResponse.next();
    if (AUTH_SECRET) {
      const tokenVal = await encode({
        token: {
          name: "Benjamin Bequette",
          email: "ben@titandiamond.net",
          id: "6821836000000565001",
          dbId: "cmppahv5m0000lsi0s00jywp3",
          role: "Administrator",
          isZohoUser: true
        },
        secret: AUTH_SECRET
      }).catch(() => null);

      if (tokenVal) {
        res.cookies.set('next-auth.session-token', tokenVal, {
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'lax'
        });
      }
    }
    return res;
  }

  // Skip static files
  if (shouldSkip(pathname)) {
    return NextResponse.next();
  }

  // API route handling
  if (pathname.startsWith('/api/')) {
    // Public APIs pass through
    if (isPublicApi(pathname)) {
      return NextResponse.next();
    }

    // All other API routes require a session
    const hasSessionCookie = req.cookies.getAll().some(c => c.name.includes('next-auth.session-token'));
    let token = null;
    if (hasSessionCookie && AUTH_SECRET) {
      token = await getToken({ req, secret: AUTH_SECRET }).catch(() => null);
      if (!token) token = await getToken({ req, secret: AUTH_SECRET, cookieName: '__Secure-next-auth.session-token' }).catch(() => null);
      if (!token) token = await getToken({ req, secret: AUTH_SECRET, cookieName: 'next-auth.session-token' }).catch(() => null);
    }

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin API routes require admin role
    if (isAdminApi(pathname) && !isAdminRole(token.role as string | undefined)) {
      return NextResponse.json({ error: 'Forbidden: Admin required' }, { status: 403 });
    }

    return NextResponse.next();
  }

  // Public routes (including /employee-login and /admin-login) always render directly
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Check for any session token in request cookies
  const hasSessionCookie = req.cookies.getAll().some(c => c.name.includes('next-auth.session-token'));
  
  let token = null;
  if (hasSessionCookie) {
    token = await getToken({ req, secret: AUTH_SECRET }).catch(() => null);
    if (!token) {
      token = await getToken({ req, secret: AUTH_SECRET, cookieName: '__Secure-next-auth.session-token' }).catch(() => null);
    }
    if (!token) {
      token = await getToken({ req, secret: AUTH_SECRET, cookieName: 'next-auth.session-token' }).catch(() => null);
    }
  }

  // If no token or session cookie, redirect to employee-login
  if (!token && !hasSessionCookie) {
    const loginUrl = new URL('/employee-login', req.url);
    loginUrl.searchParams.set('callbackUrl', `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Admin page restriction check
  if (pathname.startsWith('/admin') && token && !isAdminRole(token.role as string | undefined)) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)',
  ],
};
