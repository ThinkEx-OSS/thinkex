"use client";

import { ZeroProvider as BaseZeroProvider } from "@rocicorp/zero/react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { destroyZero, getZero } from "./client";

export function ZeroProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id ?? null;
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(null);

    if (!userId) {
      return;
    }

    const controller = new AbortController();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchToken = async () => {
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

        refreshTimer = setTimeout(fetchToken, 55 * 60 * 1000);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[zero] Failed to fetch token", error);
          setToken(null);
        }
      }
    };

    void fetchToken();

    return () => {
      controller.abort();
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      destroyZero();
    }
  }, [userId]);

  const zero = useMemo(() => {
    if (!userId) {
      destroyZero();
      return null;
    }

    return getZero({ userId, auth: token ?? "" });
  }, [token, userId]);

  if (isPending) {
    return null;
  }

  if (!zero) {
    return null;
  }

  return <BaseZeroProvider zero={zero}>{children}</BaseZeroProvider>;
}
