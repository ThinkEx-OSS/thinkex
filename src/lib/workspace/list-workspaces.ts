import { db, workspaces } from "@/lib/db/client";
import { workspaceCollaborators } from "@/lib/db/schema";
import type { CardColor } from "@/lib/workspace-state/colors";
import type { WorkspaceTemplate } from "@/lib/workspace-state/types";
import { eq, inArray, sql } from "drizzle-orm";

export interface WorkspaceListItem {
  id: string;
  userId: string;
  name: string;
  description: string;
  template: WorkspaceTemplate;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  slug: string;
  icon: string | null;
  sortOrder: number | null;
  color: CardColor | null;
  lastOpenedAt: string | null;
  isShared: boolean;
  permissionLevel?: "viewer" | "editor" | "admin";
  sharedAt?: string | null;
  collaboratorCount: number;
}

export async function listWorkspacesForUser(
  userId: string,
): Promise<WorkspaceListItem[]> {
  const [ownedWorkspaces, collaborations] = await Promise.all([
    db.select().from(workspaces).where(eq(workspaces.userId, userId)),
    db
      .select({
        workspaceId: workspaceCollaborators.workspaceId,
        permissionLevel: workspaceCollaborators.permissionLevel,
        lastOpenedAt: workspaceCollaborators.lastOpenedAt,
        createdAt: workspaceCollaborators.createdAt,
      })
      .from(workspaceCollaborators)
      .where(eq(workspaceCollaborators.userId, userId)),
  ]);

  const ownedIds = ownedWorkspaces.map((w) => w.id);
  const sharedWorkspaceIds = collaborations.map((c) => c.workspaceId);

  const [sharedWorkspaces, collaboratorCountRows] = await Promise.all([
    sharedWorkspaceIds.length > 0
      ? db
          .select()
          .from(workspaces)
          .where(inArray(workspaces.id, sharedWorkspaceIds))
      : Promise.resolve([] as typeof ownedWorkspaces),
    ownedIds.length > 0
      ? db
          .select({
            workspaceId: workspaceCollaborators.workspaceId,
            count: sql<number>`count(*)::int`,
          })
          .from(workspaceCollaborators)
          .where(inArray(workspaceCollaborators.workspaceId, ownedIds))
          .groupBy(workspaceCollaborators.workspaceId)
      : Promise.resolve([]),
  ]);

  const collaboratorCounts = new Map(
    collaboratorCountRows.map((c) => [c.workspaceId, c.count]),
  );

  const collaborationMap = new Map(
    collaborations.map((c) => [c.workspaceId, c]),
  );

  const ownedList: WorkspaceListItem[] = ownedWorkspaces.map((w) => ({
    id: w.id,
    userId: w.userId,
    name: w.name,
    description: w.description || "",
    template: (w.template as WorkspaceTemplate) || "blank",
    isPublic: w.isPublic || false,
    createdAt: w.createdAt || "",
    updatedAt: w.updatedAt || "",
    slug: w.slug || "",
    icon: w.icon,
    sortOrder: w.sortOrder ?? null,
    color: w.color as CardColor | null,
    lastOpenedAt: w.lastOpenedAt ?? null,
    isShared: false,
    collaboratorCount: collaboratorCounts.get(w.id) ?? 0,
  }));

  const sharedList: WorkspaceListItem[] = sharedWorkspaces.map((w) => {
    const collaboration = collaborationMap.get(w.id);
    return {
      id: w.id,
      userId: w.userId,
      name: w.name,
      description: w.description || "",
      template: (w.template as WorkspaceTemplate) || "blank",
      isPublic: w.isPublic || false,
      createdAt: w.createdAt || "",
      updatedAt: w.updatedAt || "",
      slug: w.slug || "",
      icon: w.icon,
      sortOrder: w.sortOrder ?? null,
      color: w.color as CardColor | null,
      lastOpenedAt: collaboration?.lastOpenedAt ?? null,
      isShared: true,
      permissionLevel:
        (collaboration?.permissionLevel as
          | "viewer"
          | "editor"
          | "admin"
          | undefined) || "viewer",
      sharedAt: collaboration?.createdAt || null,
      collaboratorCount: 0,
    };
  });

  const ownedIdSet = new Set(ownedList.map((w) => w.id));
  const uniqueSharedList = sharedList.filter((w) => !ownedIdSet.has(w.id));
  const workspaceList = [...ownedList, ...uniqueSharedList];

  workspaceList.sort((a, b) => {
    const aIsUnseenShared = a.isShared && !a.lastOpenedAt;
    const bIsUnseenShared = b.isShared && !b.lastOpenedAt;

    if (aIsUnseenShared && bIsUnseenShared) {
      const sharedA = a.sharedAt ? new Date(a.sharedAt).getTime() : 0;
      const sharedB = b.sharedAt ? new Date(b.sharedAt).getTime() : 0;
      if (sharedA !== sharedB) return sharedB - sharedA;
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
    }
    if (aIsUnseenShared) return -1;
    if (bIsUnseenShared) return 1;

    if (a.lastOpenedAt && b.lastOpenedAt) {
      return (
        new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
      );
    }
    if (a.lastOpenedAt) return -1;
    if (b.lastOpenedAt) return 1;

    if (a.sortOrder !== null && b.sortOrder !== null) {
      return a.sortOrder - b.sortOrder;
    }
    if (a.sortOrder !== null) return -1;
    if (b.sortOrder !== null) return 1;

    const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return dateB - dateA;
  });

  return workspaceList;
}
