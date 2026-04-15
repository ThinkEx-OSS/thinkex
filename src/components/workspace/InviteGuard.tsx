"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface InviteGuardProps {
  children: React.ReactNode;
}

export function InviteGuard({ children }: InviteGuardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  useEffect(() => {
    if (inviteToken) {
      router.replace(`/invite/claim/${inviteToken}`);
    }
  }, [inviteToken, router]);

  if (inviteToken) {
    return null;
  }

  return <>{children}</>;
}
