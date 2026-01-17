/**
 * Dynamic route for workspace slugs: /dashboard/[slug]
 * Renders the dashboard shell for an active workspace.
 */
import { SEO } from "@/components/seo/SEO";
import { seoConfig } from "@/lib/seo-config";
import { DashboardShell } from "../page";

interface WorkspacePageProps {
  params: Promise<{ slug: string }>;
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { slug } = await params;
  const workspaceUrl = `${seoConfig.siteUrl}/dashboard/${slug}`;

  return (
    <>
      <SEO
        title="Dashboard"
        description="Manage your workspaces, create new projects, and organize knowledge effortlessly in your ThinkEx dashboard."
        keywords="dashboard, workspace management, AI workspace, productivity tools"
        url={workspaceUrl}
        canonical={workspaceUrl}
        noindex
      />
      <DashboardShell />
    </>
  );
}

