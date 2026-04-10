"use client";

import { ZeroProvider as BaseZeroProvider } from "@rocicorp/zero/react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { getZero } from "./client";

export function ZeroProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id ?? null;
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setToken(null);
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/zero/token", {
          credentials: "include",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch Zero token: ${response.status}`);
        }

        const data = (await response.json()) as { token?: string };
        setToken(data.token ?? null);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[zero] Failed to initialize auth token", error);
          setToken(null);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [userId]);

  const zero = useMemo(() => {
    if (!userId || !token) {
      return null;
    }

    return getZero({ userId, auth: token });
  }, [token, userId]);

  if (isPending || !zero) {
    return <>{children}</>;
  }

  return <BaseZeroProvider zero={zero}>{children}</BaseZeroProvider>;
}
