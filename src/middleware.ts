import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',
  '/shop',
  '/about',
  '/contact',
  '/resources',
  '/blade-finder',
  '/applications',
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
  return PUBLIC_ROUTES.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  )
}

function shouldSkip(pathname: string): boolean {
  return SKIP_PATTERNS.some(p => pathname.startsWith(p))
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  
  // Skip static files, API routes, etc.
  if (shouldSkip(pathname)) {
    return NextResponse.next();
  }

  // Allow public routes without auth
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // For all other routes (authenticated app pages), check for session
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token) {
    // Not authenticated — check if they have the legacy local auth
    // (some users authenticate via ZohoProvider without NextAuth)
    // Allow through and let client-side handle it
    return NextResponse.next();
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
