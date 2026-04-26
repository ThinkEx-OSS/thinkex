"use client";

import { ZeroProvider as BaseZeroProvider } from "@rocicorp/zero/react";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { useSession } from "@/lib/auth-client";
import { getZeroConfigError } from "@/lib/self-host-config";
import { destroyZero, getZero } from "./client";

export function ZeroProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id ?? null;
  const zeroConfigError = getZeroConfigError();

  useEffect(() => {
    if (!userId) {
      destroyZero();
    }
  }, [userId]);

  const zero = useMemo(() => {
    if (zeroConfigError || !userId) {
      return null;
    }

    return getZero({ userId });
  }, [userId, zeroConfigError]);

  if (zeroConfigError) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="max-w-md rounded-xl border bg-background p-5 text-sm text-muted-foreground shadow-sm">
          <p className="font-medium text-foreground">Zero is required for local development.</p>
          <p className="mt-2">
            {zeroConfigError}
          </p>
        </div>
      </div>
    );
  }

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
