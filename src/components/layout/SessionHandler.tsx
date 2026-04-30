"use client";

import { useEffect, useRef } from "react";
import { useSession, signIn } from "@/lib/auth-client";
import { WorkspaceLoader } from "@/components/workspace/WorkspaceLoader";

/**
 * Ensures we never render Zero/auth-dependent UI before a session cookie is in
 * place. When no session is found, kicks off `signIn.anonymous()` exactly once
 * (StrictMode-safe) and shows the loader until the cookie lands. Without this
 * gate, the first Zero query can race the anonymous-cookie write and 401.
 */
export function AnonymousSessionHandler({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const inFlight = useRef(false);

  useEffect(() => {
    if (isPending || session || inFlight.current) return;
    inFlight.current = true;
    signIn.anonymous().catch((error) => {
      console.error("Failed to create anonymous session:", error);
      inFlight.current = false;
    });
  }, [session, isPending]);

  if (isPending || !session) return <WorkspaceLoader />;
  return <>{children}</>;
}
