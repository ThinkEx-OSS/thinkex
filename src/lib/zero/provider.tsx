"use client";

import { ZeroProvider as BaseZeroProvider } from "@rocicorp/zero/react";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "@/lib/auth-client";
import { getZeroConfigError } from "@/lib/self-host-config";
import { WorkspaceLoader } from "@/components/workspace/WorkspaceLoader";
import { mutators } from "./mutators";
import { schema } from "./zero-schema.gen";

interface ZeroStatus {
  isReady: boolean;
  /** Force a fresh Zero client (UI retry path). */
  reset: () => void;
}

const ZeroStatusContext = createContext<ZeroStatus | null>(null);

export function useZeroStatus(): ZeroStatus {
  const ctx = useContext(ZeroStatusContext);
  if (!ctx) throw new Error("useZeroStatus must be used within ZeroProvider");
  return ctx;
}

export function useZeroReset(): () => void {
  return useZeroStatus().reset;
}

const appURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const mutateURL = `${appURL}/api/zero/mutate`;
const queryURL = `${appURL}/api/zero/query`;

export function ZeroProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id;
  const configError = getZeroConfigError();
  const cacheURL = process.env.NEXT_PUBLIC_ZERO_SERVER;

  const [resetKey, setResetKey] = useState(0);

  const context = useMemo<{ userId: string } | null>(
    () => (userId ? { userId } : null),
    [userId],
  );

  const status = useMemo<ZeroStatus>(
    () => ({
      isReady: !!userId && !configError,
      reset: () => setResetKey((k) => k + 1),
    }),
    [userId, configError],
  );

  if (configError || !cacheURL) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="max-w-md rounded-xl border bg-background p-5 text-sm text-muted-foreground shadow-sm">
          <p className="font-medium text-foreground">
            Zero is required for local development.
          </p>
          <p className="mt-2">{configError ?? "NEXT_PUBLIC_ZERO_SERVER is not set."}</p>
        </div>
      </div>
    );
  }

  if (isPending || !userId || !context) {
    return (
      <ZeroStatusContext.Provider value={status}>
        <WorkspaceLoader />
      </ZeroStatusContext.Provider>
    );
  }

  return (
    <ZeroStatusContext.Provider value={status}>
      <BaseZeroProvider
        key={resetKey}
        userID={userId}
        cacheURL={cacheURL}
        mutateURL={mutateURL}
        queryURL={queryURL}
        schema={schema}
        mutators={mutators}
        context={context}
      >
        {children}
      </BaseZeroProvider>
    </ZeroStatusContext.Provider>
  );
}
