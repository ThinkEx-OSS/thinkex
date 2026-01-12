/**
 * Database types derived from Drizzle schema
 * These types match the actual database structure and API responses
 */

import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
  workspaces,
  workspaceEvents,
  workspaceSnapshots,
  userProfiles
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


// Extended types for frontend use
export interface WorkspaceWithState extends Workspace {
  state?: AgentState;
}

// API response types
export interface WorkspacesResponse {
  workspaces: WorkspaceWithState[];
}

export interface OnboardingResponse {
  profile: UserProfile;
  shouldShowOnboarding: boolean;
}
