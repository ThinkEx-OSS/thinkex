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

import { eq } from "drizzle-orm";
import { workspaces, workspaceEvents } from "@/lib/db/schema";

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
  user: {
    deleteUser: {
      enabled: true,
      afterDelete: async (user) => {
        // Cleanup workspaces since there is no cascade constraint in the DB
        try {
          await db.delete(workspaces).where(eq(workspaces.userId, user.id));
        } catch (error) {
          console.error("Failed to cleanup user workspaces:", error);
        }
      },
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
        // If the IDs are different (linking to existing account), we need to migrate the workspaces
        if (anonymousUser.user.id !== newUser.user.id) {
          try {
            // 1. Handle Slug Conflicts
            // Get potential conflicting slugs from the target user
            const existingUserWorkspaces = await db
              .select({ slug: workspaces.slug })
              .from(workspaces)
              .where(eq(workspaces.userId, newUser.user.id));

            const existingSlugs = new Set(
              existingUserWorkspaces
                .map((w) => w.slug)
                .filter((slug): slug is string => !!slug)
            );

            // Get anonymous user's workspaces
            const anonWorkspaces = await db
              .select({ id: workspaces.id, slug: workspaces.slug })
              .from(workspaces)
              .where(eq(workspaces.userId, anonymousUser.user.id));

            // Check for conflicts and rename if necessary
            for (const workspace of anonWorkspaces) {
              if (workspace.slug && existingSlugs.has(workspace.slug)) {
                let counter = 1;
                let newSlug = `${workspace.slug}-${counter}`;
                while (existingSlugs.has(newSlug)) {
                  counter++;
                  newSlug = `${workspace.slug}-${counter}`;
                }

                await db
                  .update(workspaces)
                  .set({ slug: newSlug })
                  .where(eq(workspaces.id, workspace.id));

                existingSlugs.add(newSlug);
              }
            }

            // 2. Migrate Workspaces
            await db
              .update(workspaces)
              .set({ userId: newUser.user.id })
              .where(eq(workspaces.userId, anonymousUser.user.id));

            // 3. Migrate Workspace Events
            // Also move the history/events to the new user so they don't get orphaned
            await db
              .update(workspaceEvents)
              .set({ userId: newUser.user.id })
              .where(eq(workspaceEvents.userId, anonymousUser.user.id));
          } catch (error) {
            console.error("Failed to migrate anonymous user data:", error);
            // We log but don't throw to allow the account linking to complete
            // even if data migration has issues
          }
        }
      },
    }),
    // Automatically set cookies in server actions
    // Make sure this is the last plugin in the array
    nextCookies(),
  ],
});
