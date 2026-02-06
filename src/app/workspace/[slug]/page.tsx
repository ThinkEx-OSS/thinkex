"use client";

/**
 * Dynamic route for workspace slugs: /workspace/[slug]
 * Renders the dashboard shell for an active workspace.
 * Client component to enable ssr: false for faster compilation.
 */
import { DashboardShell } from "../../dashboard/page";
import { InviteGuard } from "@/components/workspace/InviteGuard";

interface WorkspacePageProps {
  params: { slug: string };
}

export default function WorkspacePage({ params }: WorkspacePageProps) {
  return (
    <InviteGuard>
      <DashboardShell />
    </InviteGuard>
  );
}
