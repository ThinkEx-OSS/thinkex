"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { ZeroProvider as BaseZeroProvider } from "@rocicorp/zero/react";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { useTheme } from "next-themes";
import { useSession } from "@/lib/auth-client";
import { getZeroConfigError } from "@/lib/self-host-config";
import { destroyZero, getZero } from "./client";

/** Same ThinkEx animation as chat “Thinking…” — shown while session / Zero client bootstrap. */
function ZeroBootstrapLottie() {
  const { resolvedTheme } = useTheme();
  const lottieSrc =
    resolvedTheme === "light" ? "/thinkexlight.lottie" : "/logo.lottie";

  return (
    <div className="grid min-h-dvh w-full flex-1 place-items-center">
      <DotLottieReact
        src={lottieSrc}
        loop
        autoplay
        mode="bounce"
        className="h-16 w-16 shrink-0"
      />
    </div>
  );
}

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
    // Avoid blank flash during session check / anonymous session creation.
    // We cannot render children here — they use useQuery from @rocicorp/zero/react.
    return <ZeroBootstrapLottie />;
  }

  return <BaseZeroProvider zero={zero}>{children}</BaseZeroProvider>;
}
