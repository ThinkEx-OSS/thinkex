"use client";

import { useRouter } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { PostHogIdentify } from "./providers/PostHogIdentify";
import { PasswordProtectedPdfDialog } from "@/components/modals/PasswordProtectedPdfDialog";
import { OfficeDocumentRejectedDialog } from "@/components/modals/OfficeDocumentRejectedDialog";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <TooltipProvider>
      <PostHogIdentify />
      {children}
      <PasswordProtectedPdfDialog />
      <OfficeDocumentRejectedDialog />
      <Toaster
        position="top-right"
        richColors
        closeButton
        className="aui-screenshot-ignore"
      />
    </TooltipProvider>
  );
}

