import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

export const metadata: Metadata = {
  title: "Workspace",
  description: "ThinkEx workspace canvas",
};

interface WorkspacePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ invite?: string }>;
}

export default async function WorkspacePage({
  params,
  searchParams,
}: WorkspacePageProps) {
  const { invite } = await searchParams;
  if (invite) redirect(`/invite/claim/${invite}`);

  // Workspaces are never publicly accessible. Anyone arriving without a
  // session (no /home visit, no share-copy import, no auth flow) gets sent
  // to sign-in. Anonymous sessions provisioned upstream (/home, /share-copy)
  // pass through; access is gated per-workspace inside the shell.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    const { slug } = await params;
    redirect(
      `/auth/sign-in?redirect_url=${encodeURIComponent(`/workspace/${slug}`)}`,
    );
  }

  return <WorkspaceShell />;
}
