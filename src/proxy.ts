import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
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
