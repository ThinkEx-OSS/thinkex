"use client";

import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Toaster as SonnerToaster } from "sonner";
import { PostHogIdentify } from "./providers/PostHogIdentify";
import { authClient } from "@/lib/auth-client";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Helper to get redirect_url from URL or sessionStorage
  const getRedirectUrl = (): string | null => {
    if (typeof window === "undefined") return null;

    // First check current URL
    const currentUrl = new URL(window.location.href);
    const urlRedirect = currentUrl.searchParams.get("redirect_url");
    if (urlRedirect) {
      // Store in sessionStorage for future use
      sessionStorage.setItem("auth_redirect_url", urlRedirect);
      return urlRedirect;
    }

    // Fallback to sessionStorage
    return sessionStorage.getItem("auth_redirect_url");
  };

  // Wrap navigate to preserve redirect_url when navigating between auth routes
  const navigateWithRedirect = (href: string) => {
    if (typeof window !== "undefined") {
      const isAuthRoute = href.startsWith("/auth/");
      const currentIsAuthRoute = window.location.pathname.startsWith("/auth/");

      if (isAuthRoute && currentIsAuthRoute) {
        // Preserve redirect_url when switching between auth views
        const redirect_url = getRedirectUrl();

        if (redirect_url) {
          const url = new URL(href, window.location.origin);
          // Only set if not already present in href
          if (!url.searchParams.has("redirect_url")) {
            url.searchParams.set("redirect_url", redirect_url);
          }
          router.push(url.pathname + url.search);
          return;
        }
      }
    }

    router.push(href);
  };

  // Wrap replace to preserve redirect_url when navigating between auth routes
  const replaceWithRedirect = (href: string) => {
    if (typeof window !== "undefined") {
      const isAuthRoute = href.startsWith("/auth/");
      const currentIsAuthRoute = window.location.pathname.startsWith("/auth/");

      if (isAuthRoute && currentIsAuthRoute) {
        // Preserve redirect_url when switching between auth views
        const redirect_url = getRedirectUrl();

        if (redirect_url) {
          const url = new URL(href, window.location.origin);
          // Only set if not already present in href
          if (!url.searchParams.has("redirect_url")) {
            url.searchParams.set("redirect_url", redirect_url);
          }
          router.replace(url.pathname + url.search);
          return;
        }
      }
    }

    router.replace(href);
  };

  return (
    <AuthUIProvider
      authClient={authClient}
      navigate={navigateWithRedirect}
      replace={replaceWithRedirect}
      onSessionChange={() => {
        // Clear router cache (protected routes)
        router.refresh();
      }}
      Link={Link}
      social={{
        providers: ["google"],
      }}
      nameRequired={false}
      signUp={{ fields: [] }}
    >
      <PostHogIdentify />
      {children}
      <SonnerToaster
        position="top-right"
        theme="dark"
        richColors
        closeButton
        className="aui-screenshot-ignore"
      />
    </AuthUIProvider>
  );
}

