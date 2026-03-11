"use client";

/**
 * Dynamic route for workspace slugs: /workspace/[slug]
 * Renders the dashboard shell for an active workspace.
 * Client component to enable ssr: false for faster compilation.
 */
import { Palette } from "lucide-react";
import { DashboardShell } from "../../dashboard/page";
import { InviteGuard } from "@/components/workspace/InviteGuard";
import { AnnouncementPopup } from "@/components/ui/announcement-popup";

const ANNOUNCEMENT_ITEMS = [
  {
    title: "Workspace icons don't suck anymore",
    description:
      "We listened. A fresh set of 100+ icons that are actually relevant to you.",
    icon: <Palette className="size-6 text-primary" />,
    image: "/icons.png",
  },
];

interface WorkspacePageProps {
  params: { slug: string };
}

export default function WorkspacePage({ params }: WorkspacePageProps) {
  return (
    <InviteGuard>
      <DashboardShell />
      <AnnouncementPopup
        featureKey="workspace-icons-march-11-2026"
        items={ANNOUNCEMENT_ITEMS}
        ctaLabel="Got it"
      />
    </InviteGuard>
  );
}
