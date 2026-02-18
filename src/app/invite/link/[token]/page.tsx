"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AuthPageBackground } from "@/components/auth/AuthPageBackground";

export default function InviteLinkPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string | undefined;
  const { data: session, isPending: isSessionLoading } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    if (isSessionLoading) return;

    async function processLink() {
      try {
        const res = await fetch(`/api/share-link/${token}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Invalid or expired link");
          return;
        }

        if (!session || session.user?.isAnonymous) {
          const currentUrl = typeof window !== "undefined" ? window.location.href : "";
          router.replace(`/auth/sign-in?redirect_url=${encodeURIComponent(currentUrl)}`);
          return;
        }

        const claimRes = await fetch("/api/share-link/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const claimData = await claimRes.json();

        if (claimRes.ok) {
          toast.success("You've joined the workspace!");
          const slug = claimData.workspaceSlug || claimData.workspaceId;
          router.replace(slug ? `/workspace/${slug}` : "/dashboard");
        } else {
          setError(claimData.error || "Failed to join workspace");
        }
      } catch (e) {
        console.error(e);
        setError("Something went wrong");
      }
    }

    processLink();
  }, [token, session, isSessionLoading, router]);

  if (!token) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
        <AuthPageBackground />
        <div className="relative z-10 text-center">
          <h1 className="text-xl font-semibold text-foreground">Invalid link</h1>
          <p className="text-sm text-muted-foreground mt-2">This invite link is invalid.</p>
          <a href="/dashboard" className="text-sm text-primary underline mt-4 inline-block">
            Go to dashboard
          </a>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
        <AuthPageBackground />
        <div className="relative z-10 text-center space-y-6 max-w-md">
          <h1 className="text-xl font-semibold text-foreground">{error}</h1>
          <a href="/dashboard" className="text-sm text-primary underline">
            Go to dashboard
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
      <div className="absolute inset-0 bg-black z-0" />
      <AuthPageBackground />
      <div className="relative z-10 text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-white" />
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
          Joining workspace...
        </h1>
        <p className="text-sm text-white/70">This will only take a moment</p>
      </div>
    </main>
  );
}
