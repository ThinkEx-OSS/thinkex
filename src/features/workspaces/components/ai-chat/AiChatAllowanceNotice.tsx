import { Link } from "@tanstack/react-router";

import {
	getWorkspaceAiChatModelById,
	type WorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";
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

	if (allowance.isBlocked) {
		return (
			<Notice>
				You&rsquo;re out of messages{resetsOn ? ` until ${resetsOn}` : ""}.{" "}
				<UpgradeLink>Pro includes 3,000 standard and 400 premium a month</UpgradeLink>
			</Notice>
		);
	}

	if (allowance.willFallBack) {
		const fallbackName = getWorkspaceAiChatModelById("auto").name;

		return (
			<Notice>
				{fallbackName} will answer this &mdash; no {getWorkspaceAiChatModelById(modelId).name} left
				{resetsOn ? ` until ${resetsOn}` : ""}.{" "}
				<UpgradeLink>Get 400 premium messages a month</UpgradeLink>
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
