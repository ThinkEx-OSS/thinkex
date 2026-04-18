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

  if (isPending || !zero) {
    // Show a minimal loading state instead of null to avoid
    // blank screen flash during session check / anonymous session creation.
    // We cannot render children here because they use useQuery from
    // @rocicorp/zero/react which requires the BaseZeroProvider context.
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground" />
      </div>
    );
  }

  return <BaseZeroProvider zero={zero}>{children}</BaseZeroProvider>;
}
