import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { db } from "@/lib/db/client";

// Determine the base URL - prioritize explicit config, then Vercel URL, then localhost
const getBaseURL = () => {
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
};

const baseURL = getBaseURL();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      redirectURI: `${baseURL}/api/auth/callback/google`,
      prompt: "select_account",
      accessType: "offline",
    },
  },
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
  baseURL,
  trustedOrigins: [
    "https://www.thinkex.app",
    "https://thinkex.app",
    "https://thinkexv2-git-dev-chakrabortyurjit-gmailcoms-projects.vercel.app",
    ...(process.env.NEXT_PUBLIC_APP_URL ? [process.env.NEXT_PUBLIC_APP_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.NEXT_PUBLIC_VERCEL_URL ? [`https://${process.env.NEXT_PUBLIC_VERCEL_URL}`] : []),
  ],
  // Session configuration - 30 days for better user experience
  session: {
    // Session expiration set to 30 days
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    // Update session expiration every 15 days (approximately half of expiresIn)
    updateAge: 60 * 60 * 24 * 15, // 15 days
    // Session freshness for sensitive operations
    freshAge: 60 * 60 * 24, // 1 day - sessions are "fresh" if created within last day
    // Cookie caching for performance - reduces database queries
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache duration in seconds (5 minutes)
    },
  },
  // Advanced cookie security configuration
  advanced: {
    // Force secure cookies (HTTPS only) - critical for preventing session hijacking
    useSecureCookies: process.env.NODE_ENV === "production",
    // Explicitly configure cookie attributes for maximum security
    cookies: {
      session_token: {
        // Ensure HttpOnly flag is set (prevents JavaScript access)
        // Ensure Secure flag is set in production (HTTPS only)
        // Better Auth sets these by default in production, but we're being explicit
        attributes: {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax" as const, // CSRF protection while allowing normal navigation
        },
      },
    },
    // Enable IP address tracking for session binding
    ipAddress: {
      // Track IP from common proxy headers
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"],
      disableIpTracking: false, // Enable IP tracking for session binding
    },
  },
  plugins: [
    anonymous({
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        // When anonymous user signs up, their workspaces are automatically preserved
        // since they're linked to the same user ID (anonymousUser.id === newUser.id)
        // No additional action needed - workspaces persist automatically
      },
    }),
    // Automatically set cookies in server actions
    // Make sure this is the last plugin in the array
    nextCookies(),
  ],
});
