"use client";

import { useRouter } from "next/navigation";
import { Toaster as SonnerToaster } from "sonner";
import { PostHogIdentify } from "./providers/PostHogIdentify";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <>
      <PostHogIdentify />
      {children}
      <SonnerToaster
        position="top-right"
        theme="dark"
        richColors
        closeButton
        className="aui-screenshot-ignore"
      />
    </>
  );
}

