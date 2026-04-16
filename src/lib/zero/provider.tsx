"use client";

import { ZeroProvider as BaseZeroProvider } from "@rocicorp/zero/react";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { useSession } from "@/lib/auth-client";
import { destroyZero, getZero } from "./client";

export function ZeroProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      destroyZero();
    }
  }, [userId]);

  const zero = useMemo(() => {
    if (!userId) {
      return null;
    }

    return getZero({ userId });
  }, [userId]);

  if (isPending) {
    return null;
  }

  if (!zero) {
    return null;
  }

  return <BaseZeroProvider zero={zero}>{children}</BaseZeroProvider>;
}
