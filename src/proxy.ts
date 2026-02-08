import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Next.js Proxy for Better Auth
 * 
 * NOTE: getSessionCookie() only checks for cookie existence, not validation.
 * This is intentional for performance - we don't want to block requests with
 * database/API calls in proxy.
 * 
 * Actual security validation happens in:
 * - API routes using auth.api.getSession()
 * - Server components using auth.api.getSession()
 * 
 * This proxy is only for optimistic redirects based on cookie presence.
 */
export async function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  // Send all users from root to home - session handling happens there
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/home", request.url));
  }

  // Redirect authenticated users away from sign-in page only
  // Note: /sign-up is NOT blocked because anonymous users (who have a session cookie)
  // need to be able to reach the sign-up page to create a real account
  if (sessionCookie && pathname === "/sign-in") {
    const redirectUrl = request.nextUrl.searchParams.get('redirect_url') || '/home';
    return NextResponse.redirect(new URL(redirectUrl, request.url));
  }

  // Allow anonymous users to access home - they'll get an anonymous session created automatically
  // NOTE: Home page component handles creating anonymous sessions for unauthenticated users
  // Actual auth validation happens in API routes, not in middleware

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}

