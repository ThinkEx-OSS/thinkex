import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";
import type { AutumnPlugin } from "autumn-js/better-auth";

const autumnClient = () => ({
  id: "autumn" as const,
  $InferServerPlugin: {} as AutumnPlugin,
});

export const authClient = createAuthClient({
  baseURL:
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000"),
  plugins: [anonymousClient(), autumnClient()],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
