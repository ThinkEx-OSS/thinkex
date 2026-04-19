/**
 * Database types derived from Drizzle schema
 * These types match the actual database structure and API responses
 */

import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import {
  workspaces,
  workspaceItems,
  workspaceItemContent,
  workspaceItemExtracted,
  userProfiles,
  workspaceCollaborators,
} from "./schema";
import type { Item } from "@/lib/workspace-state/types";

export type Workspace = InferSelectModel<typeof workspaces>;
export type WorkspaceInsert = InferInsertModel<typeof workspaces>;

export type WorkspaceItem = InferSelectModel<typeof workspaceItems>;
export type WorkspaceItemInsert = InferInsertModel<typeof workspaceItems>;

export type WorkspaceItemContent = InferSelectModel<
  typeof workspaceItemContent
>;
export type WorkspaceItemContentInsert = InferInsertModel<
  typeof workspaceItemContent
>;

export type WorkspaceItemExtracted = InferSelectModel<
  typeof workspaceItemExtracted
>;
export type WorkspaceItemExtractedInsert = InferInsertModel<
  typeof workspaceItemExtracted
>;

export type UserProfile = InferSelectModel<typeof userProfiles>;
export type UserProfileInsert = InferInsertModel<typeof userProfiles>;

export type WorkspaceCollaborator = InferSelectModel<
  typeof workspaceCollaborators
>;
export type WorkspaceCollaboratorInsert = InferInsertModel<
  typeof workspaceCollaborators
>;

export type PermissionLevel = "viewer" | "editor";

export interface WorkspaceWithState extends Workspace {
  state?: Item[];
  isShared?: boolean;
  permissionLevel?: "viewer" | "editor" | "admin";
  collaboratorCount?: number;
}

export interface WorkspacesResponse {
  workspaces: WorkspaceWithState[];
}

export interface OnboardingResponse {
  profile: UserProfile;
  shouldShowOnboarding: boolean;
}
