"use client";

import { useRouter } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { PostHogIdentify } from "./providers/PostHogIdentify";
import { PasswordProtectedPdfDialog } from "@/components/modals/PasswordProtectedPdfDialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VersionUpdateBanner } from "@/components/ui/version-update-banner";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <TooltipProvider>
      <PostHogIdentify />
      {children}
      <VersionUpdateBanner />
      <PasswordProtectedPdfDialog />
      <Toaster position="top-right" richColors closeButton />
    </TooltipProvider>
  );
}

