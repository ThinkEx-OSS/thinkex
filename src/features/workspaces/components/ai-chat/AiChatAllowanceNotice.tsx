import { Link } from "@tanstack/react-router";

import {
	getWorkspaceAiChatModelById,
	type WorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";
import { useIsProPlan } from "#/features/account/use-pro-plan";
import { useWorkspaceAiAllowance } from "#/features/workspaces/ai/use-workspace-ai-allowance";

interface AiChatAllowanceNoticeProps {
	modelId: WorkspaceAiChatModelId;
}

/**
 * Announces what is about to happen to this message; never keeps score. A
 * running count above the composer is the most-looked-at pixel in the app, and
 * watching it tick down makes people ration an allowance they will almost never
 * reach — which costs more in lost conversions than it saves in usage.
 *
 * So there is no "running low" state: premium running out is not a wall, the
 * turn still sends on the fallback, and warning about a painless event only
 * manufactures dread.
 */
export function AiChatAllowanceNotice({ modelId }: AiChatAllowanceNoticeProps) {
	const allowance = useWorkspaceAiAllowance(modelId);
	const resetsOn = formatResetDate(allowance.resetsAt);
	// Subscribers get the fact without the pitch; there is nothing left to sell
	// them, so an upgrade line would only advertise that we forgot they pay.
	const isPro = useIsProPlan();
	const upgrade = isPro ? null : (
		<>
			{" "}
			<UpgradeLink>Pro includes 3,000 standard and 400 premium a month</UpgradeLink>
		</>
	);

	if (allowance.isBlocked) {
		return (
			<Notice>
				You&rsquo;re out of messages{resetsOn ? ` until ${resetsOn}` : ""}.{upgrade}
			</Notice>
		);
	}

	if (allowance.fallbackModelId) {
		// The model the gate actually resolved, not a guess made here.
		const fallbackName = getWorkspaceAiChatModelById(allowance.fallbackModelId).name;

		return (
			<Notice>
				{fallbackName} will answer this &mdash; no {getWorkspaceAiChatModelById(modelId).name} left
				{resetsOn ? ` until ${resetsOn}` : ""}.{upgrade}
			</Notice>
		);
	}

	return null;
}

function Notice({ children }: { children: React.ReactNode }) {
	return <p className="px-1 text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

// Gain-framed on purpose: naming what Pro includes converts better than telling
// someone a limit was reached.
function UpgradeLink({ children }: { children: React.ReactNode }) {
	return (
		<Link
			to="."
			replace
			search={(previous: Record<string, unknown>) => ({
				...previous,
				settings: "plan" as const,
			})}
			className="font-medium text-foreground underline underline-offset-4"
		>
			{children}
		</Link>
	);
}

function formatResetDate(resetsAt: number | null) {
	if (!resetsAt) {
		return null;
	}

	const date = new Date(resetsAt);

	return Number.isNaN(date.getTime())
		? null
		: date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}
