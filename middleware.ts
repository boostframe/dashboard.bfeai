import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/logout',
  '/oauth-start',
  '/sso-complete',
  '/sso-exchange',
  '/sso-landing',
  '/terms',
  '/privacy',
];

const PUBLIC_API_PREFIXES = [
  '/api/auth/',
  '/api/health',
  '/api/csrf',
  '/api/bugs',
];

const STATIC_PREFIXES = [
  '/_next',
  '/.netlify',
  '/favicon',
  '/brand',
  '/public',
];

function isPublicPath(pathname: string): boolean {
  if (STATIC_PREFIXES.some(p => pathname.startsWith(p))) return true;
  if (pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|woff|woff2|ttf|eot|css|js)$/)) return true;
  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) return true;
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return false;
}

function isAuthPage(pathname: string): boolean {
  return ['/login', '/signup'].includes(pathname);
}

function hasValidToken(request: NextRequest): boolean {
  const token = request.cookies.get('bfeai_session')?.value;
  if (!token) return false;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    // Portable base64 decode for Edge runtime
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp || payload.exp * 1000 < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (isPublicPath(pathname)) {
    // Redirect authenticated users away from login/signup to dashboard
    if (isAuthPage(pathname) && hasValidToken(request)) {
      const redirect = request.nextUrl.searchParams.get('redirect');
      if (redirect) {
        if (redirect.startsWith('https://') && redirect.includes('.bfeai.com')) {
          return NextResponse.redirect(new URL(redirect));
        }
        return NextResponse.redirect(new URL(redirect, request.url));
      }
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Protected paths — require valid auth
  if (!hasValidToken(request)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
