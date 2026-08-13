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
  '/docs',
  '/careers',
  '/admin-login',
  '/employee-login',
  '/customer-portal',
  '/privacy',
  '/terms',
  '/login',
  '/intro-offer',
  '/rep-portal',
]

// Static file and API patterns to skip
const SKIP_PATTERNS = [
  '/api/',
  '/_next/',
  '/favicon',
  '/icon-',
  '/apple-touch-icon',
  '/manifest.json',
  '/tv',
  '/print/',
  '/vcard/',
]

function isPublicRoute(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_ROUTES.some(route => 
    route !== '/' && (pathname === route || pathname.startsWith(route + '/'))
  );
}

function shouldSkip(pathname: string): boolean {
  return SKIP_PATTERNS.some(p => pathname.startsWith(p))
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  
  // Skip static files, API routes, etc.
  if (shouldSkip(pathname)) {
    return NextResponse.next();
  }

  // Allow public routes without auth
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // For all other routes (authenticated staff pages), require a Zoho session.
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET });
  
  if (!token) {
    const loginUrl = new URL('/employee-login', req.url);
    loginUrl.searchParams.set('callbackUrl', `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith('/admin') && !isAdminRole(token.role as string | undefined)) {
    return NextResponse.redirect(new URL('/sales', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)',
  ],
};
