"use client";

import { useRouter } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { PostHogIdentify } from "./providers/PostHogIdentify";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <>
      <PostHogIdentify />
      {children}
      <Toaster
        position="top-right"
        richColors
        closeButton
        className="aui-screenshot-ignore"
      />
    </>
  );
}

