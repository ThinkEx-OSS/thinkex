import type { BillingPeriod } from "#/features/account/pricing";
import type { WorkspaceMembershipRole, WorkspaceSummary } from "#/features/workspaces/contracts";

export type WorkspaceInviteType = "email" | "link";

export type AuthMethod = "google" | "guest";

export interface PostHogEventPropertiesByName {
	auth_started: {
		method: AuthMethod;
		source: string;
	};
	"user signed up": {
		method: AuthMethod;
	};
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
		failure_codes: string[];
		failure_count: number;
		outcome: "error" | "partial" | "success";
		runtime_success: boolean;
		compute_error_name?: string | null;
		compute_error_code?: string | null;
		compute_error_retryable?: boolean | null;
		compute_error_line_number?: number | null;
	};
	ai_turn_failed: {
		thread_id: string;
		workspace_id: string;
		trace_id: string;
		error_stage: string | null;
		error_classification: string | null;
		error_message: string;
		messages_persisted: boolean | null;
		request_id: string | null;
	};
	workspace_file_extraction_completed: {
		actor_user_id: string | null;
		asset_kind: string;
		/** LlamaParse credits actually billed, which provider_mode alone cannot tell you. */
		credits_used: number | null;
		duration_ms: number;
		enhancement_duration_ms: number;
		enhancement_error_message: string | null;
		enhancement_error_type: string | null;
		enhancement_outcome: "error" | "success";
		error_type: string | null;
		item_id: string;
		liteparse_duration_ms: number;
		liteparse_error_type: string | null;
		liteparse_markdown_length: number | null;
		liteparse_outcome: "error" | "skipped" | "success";
		liteparse_page_count: number | null;
		outcome: "error" | "partial" | "success";
		page_count: number | null;
		provider: string | null;
		provider_mode: string | null;
		request_id: string | null;
		route_reason: string | null;
		workflow_id: string;
		workspace_id: string;
	};
	/**
	 * Emitted only when someone is actually stopped, not when they fall back to
	 * the other tier. Separate from the thrown error so a billing wall is
	 * countable without string-matching a failure message — this is the number
	 * that says whether a top-up is worth building, and for whom.
	 */
	usage_limit_reached: {
		feature_id: string;
		surface: "ai_message" | "file_upload";
	};
	/**
	 * Reaching for the plan after being stopped. `usage_limit_reached` already
	 * counts the walls, so this is the middle of the funnel and nothing else:
	 * without it, a wall nobody acts on looks the same as one people act on and
	 * then balk at the price, and those two want opposite fixes.
	 *
	 * The picker is not covered by `usage_limit_reached` at all — refusing a
	 * selection never reaches the server — so this is the only signal there.
	 */
	upgrade_prompt_clicked: {
		feature_id: string;
		source: "ai_allowance_notice" | "ai_model_picker";
	};
	/**
	 * The end of the funnel. Stripe knows the revenue; only this knows which wall
	 * it came from, via a PostHog funnel back to the click.
	 */
	upgrade_checkout_started: {
		billing_period: BillingPeriod;
		reason: string | null;
	};
	workspace_file_intake_completed: {
		asset_kind: string | null;
		conversion: string | null;
		duration_ms: number;
		error_code: string | null;
		input_bytes: number | null;
		intake_kind: "chat_attachment" | "workspace_file";
		item_id: string | null;
		outcome: "error" | "rejected" | "success";
		output_bytes: number | null;
		plan_kind: "document" | "file" | null;
		status_code: number;
		workspace_id: string;
	};
}

export type PostHogEventName = keyof PostHogEventPropertiesByName;
export type PostHogClientEventName =
	| "workspace_invite_link_copied"
	| "auth_started"
	| "upgrade_prompt_clicked"
	| "upgrade_checkout_started";
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
