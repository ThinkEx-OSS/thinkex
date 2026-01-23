"use client";

/**
 * Dynamic route for workspace slugs: /dashboard/[slug]
 * Renders the dashboard shell for an active workspace.
 * Client component to enable ssr: false for faster compilation.
 */
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// Lazy load the dashboard shell to reduce initial compilation time
// This splits the heavy dashboard components into a separate chunk
// ssr: false speeds up compilation by skipping server-side rendering
const DashboardShell = dynamic(() => import("../page").then(mod => ({ default: mod.DashboardShell })), {
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
  ssr: false, // Disable SSR since this is a client-only component - speeds up compilation
});

interface WorkspacePageProps {
  params: { slug: string };
}

export default function WorkspacePage({ params }: WorkspacePageProps) {
  return <DashboardShell />;
}

