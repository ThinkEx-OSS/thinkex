import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 
           process.env.NEXT_PUBLIC_APP_URL || 
           (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"),
  plugins: [
    anonymousClient(),
  ],
});

export const { 
  signIn, 
  signUp, 
  signOut, 
  useSession,
  getSession
} = authClient;
