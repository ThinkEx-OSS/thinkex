/**
 * Database types derived from Drizzle schema
 * These types match the actual database structure and API responses
 */

import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
  workspaces,
  workspaceEvents,
  workspaceSnapshots,
  userProfiles,
  workspaceCollaborators
} from './schema';
import type { AgentState } from '@/lib/workspace-state/types';

// Base database types (what Drizzle returns)
export type Workspace = InferSelectModel<typeof workspaces>;
export type WorkspaceInsert = InferInsertModel<typeof workspaces>;

// WorkspaceState types removed - state is now managed via event sourcing
// WorkspaceShare types removed - sharing is now fork-based (users import copies)

export type WorkspaceEvent = InferSelectModel<typeof workspaceEvents>;
export type WorkspaceEventInsert = InferInsertModel<typeof workspaceEvents>;

export type WorkspaceSnapshot = InferSelectModel<typeof workspaceSnapshots>;
export type WorkspaceSnapshotInsert = InferInsertModel<typeof workspaceSnapshots>;

export type UserProfile = InferSelectModel<typeof userProfiles>;
export type UserProfileInsert = InferInsertModel<typeof userProfiles>;

export type WorkspaceCollaborator = InferSelectModel<typeof workspaceCollaborators>;
export type WorkspaceCollaboratorInsert = InferInsertModel<typeof workspaceCollaborators>;

export type PermissionLevel = 'viewer' | 'editor';


// Extended types for frontend use
export interface WorkspaceWithState extends Workspace {
  state?: AgentState;
  isShared?: boolean;
  permissionLevel?: 'viewer' | 'editor' | 'admin'; // admin is implied for owner but good to have in types
}

// API response types
export interface WorkspacesResponse {
  workspaces: WorkspaceWithState[];
}

export interface OnboardingResponse {
  profile: UserProfile;
  shouldShowOnboarding: boolean;
}
