import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import AiChatComposerReveal from "#/features/workspaces/components/ai-chat/AiChatComposerReveal";
import { showUpgradeDialog } from "#/features/account/upgrade-navigation";
import {
	getWorkspaceAiChatModelById,
	type WorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";
import { WORKSPACE_AI_MESSAGE_FEATURE_IDS } from "#/integrations/autumn/workspace-ai-access";
import { capturePostHogClientEvent } from "#/integrations/posthog/provider";
import { formatBillingResetDate, useBillingState } from "#/features/account/use-billing-state";
import {
	useWorkspaceAiAllowance,
	useWorkspaceAiTierBalances,
} from "#/features/workspaces/ai/use-workspace-ai-allowance";

interface AiChatAllowanceNoticeProps {
	modelId: WorkspaceAiChatModelId;
}

/**
 * Announces the wall, and nothing else; never keeps score. A running count above
 * the composer is the most-looked-at pixel in the app, and watching it tick down
 * makes people ration an allowance they will almost never reach — which costs
 * more in lost conversions than it saves in usage.
 *
 * So there is no "running low" state, and a downgrade renders nothing: the model
 * picker already names what will answer, and saying it twice left a second line
 * under the composer for the rest of the billing period.
 */
export function AiChatAllowanceNotice({ modelId }: AiChatAllowanceNoticeProps) {
	const allowance = useWorkspaceAiAllowance(modelId);
	const premiumLeft = useWorkspaceAiTierBalances().premium.hasBalance;
	const resetsOn = formatBillingResetDate(allowance.resetsAt);
	// Subscribers get the fact without the pitch; there is nothing left to sell
	// them, so an upgrade control would only advertise that we forgot they pay.
	const { isPro } = useBillingState();

	// Standard running out no longer spends premium on the user's behalf, so the
	// blocked state is reachable with premium still in the account: a dead
	// composer, and an unspent balance reachable only by opening the model picker
	// on a hunch. Four words are cheaper than leaving someone stuck next to
	// messages they already have. Only when it's true — saying it with nothing
	// left would be the same lie as "out of messages" is when premium remains.
	//
	// When not blocked, nothing renders: a downgraded turn says so on the model
	// picker itself, which names what will answer rather than what was picked.
	// Repeating it here put a second line under the composer for the rest of the
	// billing period, contradicting the button beside it the whole time.
	return (
		<AiChatComposerReveal>
			{allowance.isBlocked ? (
				<div className="flex items-center gap-2 px-1 pt-1">
					<p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
						You&rsquo;re out of {premiumLeft ? "standard messages" : "messages"}
						{resetsOn ? ` until ${resetsOn}` : ""}.
						{premiumLeft ? " Premium models still work." : ""}
					</p>
					{/* A control rather than a sentence about what Pro includes: this sits in
					    the one spot where someone has already been stopped, so the plan
					    details belong in the dialog it opens, not in the line that stops
					    them. */}
					{isPro ? null : (
						<Button
							className="ml-auto"
							nativeButton={false}
							onClick={() => {
								capturePostHogClientEvent("upgrade_prompt_clicked", {
									feature_id:
										WORKSPACE_AI_MESSAGE_FEATURE_IDS[
											getWorkspaceAiChatModelById(modelId).billingTier
										],
									source: "ai_allowance_notice",
								});
							}}
							render={<Link replace search={showUpgradeDialog} to="." />}
							size="xs"
						>
							Upgrade
						</Button>
					)}
				</div>
			) : null}
		</AiChatComposerReveal>
	);
}
