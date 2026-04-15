"use client";

import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

type InviteError =
  | "expired"
  | "not-found"
  | "email-mismatch"
  | "workspace-deleted";

const inviteErrorContent: Record<
  InviteError,
  { title: string; description: string }
> = {
  expired: {
    title: "Invite Expired",
    description:
      "This invite has expired. Ask the workspace owner for a new one.",
  },
  "not-found": {
    title: "Invalid Invite",
    description: "This invite link is invalid or has already been used.",
  },
  "email-mismatch": {
    title: "Wrong Account",
    description:
      "This invite is for a different email address. Log out and sign in with the correct account.",
  },
  "workspace-deleted": {
    title: "Workspace Unavailable",
    description: "This workspace no longer exists.",
  },
};

export default function InviteErrorPage({ error }: { error: InviteError }) {
  const content = inviteErrorContent[error] ?? inviteErrorContent["not-found"];

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-6 p-8 text-center animate-in fade-in duration-500">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
        <ShieldAlert className="h-10 w-10 text-destructive" />
      </div>

      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {content.title}
        </h1>
        <p className="text-muted-foreground">{content.description}</p>
      </div>

      <div className="flex gap-4">
        <Button asChild variant="outline" size="lg" className="gap-2">
          <Link href="/home">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </Button>
      </div>
    </div>
  );
}
