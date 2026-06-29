import type { WorkspaceMembershipRole, WorkspaceSummary } from "#/features/workspaces/contracts";

export type WorkspaceInviteType = "email" | "link";

export interface PostHogEventPropertiesByName {
	workspace_created: {
		workspace_id: string;
		workspace_name: string;
		workspace_color: string | null;
		workspace_icon: string | null;
		membership_role: WorkspaceMembershipRole;
	};
	workspace_shared: {
		workspace_id: string;
		share_method: "email";
		shared_role: WorkspaceMembershipRole;
		invite_count_requested: number;
		invite_count_persisted: number;
		invite_count_delivered: number;
		invite_count_failed: number;
		invite_count_skipped: number;
	};
	workspace_invite_accepted: {
		workspace_id: string;
		invite_type: WorkspaceInviteType;
		invite_role: WorkspaceMembershipRole;
		membership_role: WorkspaceMembershipRole;
	};
	workspace_invite_link_copied: {
		workspace_id: string;
		share_method: "link";
		shared_role: WorkspaceMembershipRole;
	};
	ai_turn_started: {
		thread_id: string;
		workspace_id: string;
		trace_id: string;
		model_id: string;
		continuation: boolean;
	};
	ai_turn_completed: {
		thread_id: string;
		workspace_id: string;
		trace_id: string;
		status: string;
		step_count: number;
	};
	ai_tool_invoked: {
		thread_id: string;
		workspace_id: string;
		trace_id: string;
		tool_name: string;
		success: boolean;
		duration_ms: number;
	};
	ai_turn_failed: {
		thread_id: string;
		workspace_id: string;
		trace_id: string;
		error_stage: string | null;
		error_classification: string | null;
		error_message: string;
	};
}

export type PostHogEventName = keyof PostHogEventPropertiesByName;
export type PostHogClientEventName = "workspace_invite_link_copied";
export type PostHogServerEventName = Exclude<PostHogEventName, PostHogClientEventName>;

export function buildWorkspaceCreatedEventProperties(
	workspace: Pick<WorkspaceSummary, "id" | "name" | "color" | "icon" | "membershipRole">,
): PostHogEventPropertiesByName["workspace_created"] {
	return {
		workspace_id: workspace.id,
		workspace_name: workspace.name,
		workspace_color: workspace.color,
		workspace_icon: workspace.icon,
		membership_role: workspace.membershipRole,
	};
}

export function buildWorkspaceSharedEventProperties(input: {
	workspaceId: string;
	role: WorkspaceMembershipRole;
	requestedCount: number;
	persistedCount: number;
	deliveredCount: number;
	failedCount: number;
	skippedCount: number;
}): PostHogEventPropertiesByName["workspace_shared"] {
	return {
		workspace_id: input.workspaceId,
		share_method: "email",
		shared_role: input.role,
		invite_count_requested: input.requestedCount,
		invite_count_persisted: input.persistedCount,
		invite_count_delivered: input.deliveredCount,
		invite_count_failed: input.failedCount,
		invite_count_skipped: input.skippedCount,
	};
}

export function buildWorkspaceInviteAcceptedEventProperties(input: {
	workspaceId: string;
	inviteType: WorkspaceInviteType;
	inviteRole: WorkspaceMembershipRole;
	membershipRole: WorkspaceMembershipRole;
}): PostHogEventPropertiesByName["workspace_invite_accepted"] {
	return {
		workspace_id: input.workspaceId,
		invite_type: input.inviteType,
		invite_role: input.inviteRole,
		membership_role: input.membershipRole,
	};
}

export function buildWorkspaceInviteLinkCopiedEventProperties(input: {
	workspaceId: string;
	role: WorkspaceMembershipRole;
}): PostHogEventPropertiesByName["workspace_invite_link_copied"] {
	return {
		workspace_id: input.workspaceId,
		share_method: "link",
		shared_role: input.role,
	};
}
