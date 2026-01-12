"use client";

import { useSearchParams } from "next/navigation";
import { AuthView } from "@daveyplate/better-auth-ui";

interface AuthViewWrapperProps {
  path: string;
  redirectTo: string;
  classNames?: {
    base?: string;
  };
}

export function AuthViewWrapper({ path, redirectTo, classNames }: AuthViewWrapperProps) {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url");

  // Use redirect_url from URL, sessionStorage (as fallback), or default redirectTo
  // The AuthUIProvider now handles preserving redirect_url in navigation,
  // so this mainly ensures the redirectTo prop gets the right value
  const finalRedirectTo = redirectUrl || 
    (typeof window !== "undefined" ? sessionStorage.getItem("auth_redirect_url") : null) || 
    redirectTo;

  return (
    <AuthView 
      path={path} 
      redirectTo={finalRedirectTo}
      classNames={classNames}
    />
  );
}

