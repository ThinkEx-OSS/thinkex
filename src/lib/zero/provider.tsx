"use client";

import { ZeroProvider as BaseZeroProvider } from "@rocicorp/zero/react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "@/lib/auth-client";
import { getZeroConfigError } from "@/lib/self-host-config";
import { WorkspaceLoader } from "@/components/workspace/WorkspaceLoader";
import { destroyZero, getZero } from "./client";

interface ZeroStatus {
  isReady: boolean;
  /** Returns a promise so callers can await full teardown if they need to. */
  reset: () => Promise<void>;
}

const ZeroStatusContext = createContext<ZeroStatus | null>(null);

export function useZeroStatus(): ZeroStatus {
  const ctx = useContext(ZeroStatusContext);
  if (!ctx) throw new Error("useZeroStatus must be used within ZeroProvider");
  return ctx;
}

/** Recreate the Zero client for the current user (UI retry path). */
export function useZeroReset(): () => Promise<void> {
  return useZeroStatus().reset;
}

export function ZeroProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id ?? null;
  const configError = getZeroConfigError();

  const [resetVersion, setResetVersion] = useState(0);

  // Logout-only teardown. User-swap is handled inside getZero. Don't destroy
  // in an effect cleanup — StrictMode would close the live client mid-render.
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevUserIdRef.current && !userId) void destroyZero();
    prevUserIdRef.current = userId;
  }, [userId]);

  const zero = useMemo(
    () => (configError || !userId ? null : getZero({ userId })),
    // resetVersion is intentional: bumping it forces a new client after reset().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, configError, resetVersion],
  );

  const status = useMemo<ZeroStatus>(
    () => ({
      isReady: !!zero,
      reset: async () => {
        await destroyZero();
        setResetVersion((v) => v + 1);
      },
    }),
    [zero],
  );

  if (configError) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="max-w-md rounded-xl border bg-background p-5 text-sm text-muted-foreground shadow-sm">
          <p className="font-medium text-foreground">
            Zero is required for local development.
          </p>
          <p className="mt-2">{configError}</p>
        </div>
      </div>
    );
  }

  if (isPending || !zero) {
    return (
      <ZeroStatusContext.Provider value={status}>
        <WorkspaceLoader />
      </ZeroStatusContext.Provider>
    );
  }

  return (
    <ZeroStatusContext.Provider value={status}>
      <BaseZeroProvider zero={zero}>{children}</BaseZeroProvider>
    </ZeroStatusContext.Provider>
  );
}
