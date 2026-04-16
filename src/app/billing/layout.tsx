"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnonymousSessionHandler } from "@/components/layout/SessionHandler";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";

function BillingAccessGate({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && (!session || session.user?.isAnonymous)) {
      router.replace("/auth/sign-up?redirect_url=%2Fbilling");
    }
  }, [isPending, router, session]);

  if (isPending || !session || session.user?.isAnonymous) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-12 md:px-6">
        <div className="space-y-3 text-center">
          <Skeleton className="mx-auto h-10 w-56" />
          <Skeleton className="mx-auto h-4 w-72" />
        </div>
        <div className="space-y-4 rounded-2xl border bg-card p-6">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-2 w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </main>
    );
  }

  return <>{children}</>;
}

export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AnonymousSessionHandler>
      <BillingAccessGate>{children}</BillingAccessGate>
    </AnonymousSessionHandler>
  );
}
