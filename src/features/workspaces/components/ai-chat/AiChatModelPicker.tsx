import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronUp, Waypoints } from "lucide-react";
import { useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { showUpgradeDialogFor } from "#/features/account/upgrade-navigation";
import {
	getWorkspaceAiChatModelById,
	WORKSPACE_AI_CHAT_MODELS,
	WORKSPACE_AI_CHAT_PROVIDERS,
	type WorkspaceAiChatModel,
	type WorkspaceAiChatModelId,
	type WorkspaceAiChatModelLevel,
} from "#/features/workspaces/ai/models";
import { useBillingState } from "#/features/account/use-billing-state";
import {
	useWorkspaceAiAllowance,
	useWorkspaceAiTierBalances,
} from "#/features/workspaces/ai/use-workspace-ai-allowance";
import { WORKSPACE_AI_MESSAGE_FEATURE_IDS } from "#/integrations/autumn/workspace-ai-access";
import { capturePostHogClientEvent } from "#/integrations/posthog/provider";
import { ProviderLogo } from "#/features/workspaces/components/ai-chat/ProviderLogo";
import { WorkspaceToolbarTextButton } from "#/features/workspaces/components/WorkspaceToolbar";
import { cn } from "#/lib/utils";

interface AiChatModelPickerProps {
	modelId: WorkspaceAiChatModelId;
	onModelChange?: (modelId: WorkspaceAiChatModelId) => void;
}

const AUTO_MODEL = WORKSPACE_AI_CHAT_MODELS.find((model) => model.provider === "auto");
const MODEL_GROUPS = WORKSPACE_AI_CHAT_PROVIDERS.flatMap((provider) => {
	const models = WORKSPACE_AI_CHAT_MODELS.filter((model) => model.provider === provider.id);
	return models.length > 0 ? [{ ...provider, models }] : [];
});

export default function AiChatModelPicker({ modelId, onModelChange }: AiChatModelPickerProps) {
	const [open, setOpen] = useState(false);
	// The model whose details are shown in the side panel. Falls back to the
	// selected model whenever the pointer isn't over a list item, so quickly
	// dragging across the list just updates this one panel — no flicker, and
	// only ever one set of details visible at a time.
	const [previewId, setPreviewId] = useState<WorkspaceAiChatModelId | null>(null);

	// The trigger names what will actually answer, not what was picked. Leaving it
	// on the picked model meant the button spent whole billing periods claiming a
	// model the gate had already swapped out. The stored choice is untouched, so
	// it comes back on its own when the balance resets.
	const { fallbackModelId } = useWorkspaceAiAllowance(modelId);
	const selectedModel = getWorkspaceAiChatModelById(fallbackModelId ?? modelId);
	const detailModel = getWorkspaceAiChatModelById(previewId ?? modelId);
	const balances = useWorkspaceAiTierBalances();
	// Subscribers who are out still get to pick: there is nothing left to sell
	// them, and pitching Pro to someone who pays for it reads as the product not
	// knowing who they are.
	const { isPro } = useBillingState();
	const navigate = useNavigate();

	// The "Auto" option lives outside the provider groups — it's ThinkEx's own
	// choice, not a provider's model.
	//
	// Reaching for a model whose tier is empty is the highest-intent upgrade
	// moment there is — someone choosing to upgrade, rather than being
	// interrupted mid-message. So the click offers the plan that would run it,
	// rather than selecting a model the gate is going to refuse.
	const handleSelect = (nextId: WorkspaceAiChatModelId) => {
		const tier = getWorkspaceAiChatModelById(nextId).billingTier;

		if (!isPro && !balances[tier].hasBalance) {
			capturePostHogClientEvent("upgrade_prompt_clicked", {
				feature_id: WORKSPACE_AI_MESSAGE_FEATURE_IDS[tier],
				source: "ai_model_picker",
			});

			// The one entry point that stops someone without saying why first, so it
			// hands the dialog the tier it refused.
			void navigate({
				replace: true,
				search: showUpgradeDialogFor(WORKSPACE_AI_MESSAGE_FEATURE_IDS[tier]),
				to: ".",
			});
			setOpen(false);
			return;
		}

		onModelChange?.(nextId);
		setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (nextOpen) {
					setPreviewId(null);
				}
			}}
		>
			<PopoverTrigger
				render={
					<WorkspaceToolbarTextButton className="min-w-0 max-w-48 px-2 font-normal sm:px-2" />
				}
			>
				<span className="truncate">{selectedModel.name}</span>
				<ChevronUp className="size-3.5 shrink-0 opacity-60" />
			</PopoverTrigger>
			<PopoverContent
				side="top"
				align="start"
				alignOffset={-140}
				className="grid h-[22rem] max-h-[calc(100vh-1.5rem)] w-[30rem] max-w-[calc(100vw-1.5rem)] grid-cols-2 gap-0 overflow-hidden p-0"
			>
				{/* Left: grouped, scrollable model list */}
				<div className="h-full min-w-0 overflow-y-auto border-r border-border/70 p-1.5">
					{AUTO_MODEL ? (
						<div className="mb-1">
							<div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
								<Waypoints className="size-3.5 shrink-0" />
								Picks for you
							</div>
							<ModelPickerRow
								name={AUTO_MODEL.name}
								isSelected={AUTO_MODEL.id === modelId}
								isPreviewing={AUTO_MODEL.id === (previewId ?? modelId)}
								onSelect={() => handleSelect(AUTO_MODEL.id)}
								onPreview={() => setPreviewId(AUTO_MODEL.id)}
							/>
						</div>
					) : null}
					{MODEL_GROUPS.map((group) => (
						<div key={group.id} className="mb-1 last:mb-0">
							<div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
								<ProviderLogo provider={group.id} className="size-3.5 opacity-65" />
								{group.label}
							</div>
							{group.models.map((model) => (
								<ModelPickerRow
									key={model.id}
									name={model.name}
									isSelected={model.id === modelId}
									isPreviewing={model.id === (previewId ?? modelId)}
									showPremium={model.billingTier === "premium"}
									onSelect={() => handleSelect(model.id)}
									onPreview={() => setPreviewId(model.id)}
								/>
							))}
						</div>
					))}
				</div>

				{/* Right: details for the hovered (or selected) model */}
				<ModelDetails model={detailModel} />
			</PopoverContent>
		</Popover>
	);
}

function ModelPickerRow({
	name,
	isSelected,
	isPreviewing,
	showPremium = false,
	onSelect,
	onPreview,
}: {
	name: string;
	isSelected: boolean;
	isPreviewing: boolean;
	showPremium?: boolean;
	onSelect: () => void;
	onPreview: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={isSelected}
			onClick={onSelect}
			onMouseEnter={onPreview}
			onFocus={onPreview}
			className={cn(
				// ponytail: every row keeps a fixed left check gutter so selected and
				// unselected names share one baseline — the mark sits in that gutter,
				// never pushes the label, and never fights Premium for the right edge.
				"flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors",
				isPreviewing ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/60",
			)}
		>
			<span aria-hidden className="flex size-3.5 shrink-0 items-center justify-center">
				{isSelected ? <Check className="size-3.5 text-foreground" /> : null}
			</span>
			<span className="min-w-0 truncate">{name}</span>
			{/* Quiet text rather than a badge: the rows are dense, and a filled pill
			    on every premium row would out-shout the names. */}
			{showPremium ? (
				<span className="ml-auto shrink-0 text-[0.6875rem] text-muted-foreground">Premium</span>
			) : null}
		</button>
	);
}

function ModelDetails({ model }: { model: WorkspaceAiChatModel }) {
	return (
		<div className="flex min-w-0 flex-col gap-3 p-4">
			<div className="flex items-center gap-2.5">
				{model.provider === "auto" ? (
					<Waypoints className="size-4 shrink-0 text-muted-foreground" />
				) : null}
				{model.provider !== "auto" ? (
					<ProviderLogo provider={model.provider} className="size-4 shrink-0 opacity-65" />
				) : null}
				{/* No truncate: the tier moved down to its own row, so the name owns the
				    full width and long names wrap rather than getting cut. */}
				<div className="min-w-0 font-medium text-foreground">{model.name}</div>
			</div>

			<p className="text-xs leading-relaxed text-muted-foreground">{model.description}</p>

			<div className="mt-auto flex flex-col gap-2 pt-3">
				<div className="rounded-md border border-border/70 bg-muted/60 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-input/40">
					<span className="text-muted-foreground">Great for </span>
					<span className="font-medium text-foreground">{model.bestFor}</span>
				</div>
				<StatBar label="Intelligence" value={model.intelligence} />
				<StatBar label="Speed" value={model.speed} />
				{/* Both tiers render a badge so the row keeps one height as you hover
				    between models. */}
				<div className="flex items-center justify-between gap-3">
					<span className="text-xs text-muted-foreground">Cost</span>
					<Badge variant={model.billingTier === "premium" ? "premium" : "secondary"}>
						{model.billingTier === "premium" ? "Premium" : "Standard"}
					</Badge>
				</div>
			</div>
		</div>
	);
}

function StatBar({ label, value }: { label: string; value: WorkspaceAiChatModelLevel }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-xs text-muted-foreground">{label}</span>
			<div className="flex gap-1">
				{[1, 2, 3, 4].map((segment) => (
					<span
						key={segment}
						className={cn(
							"h-1.5 w-5 rounded-full",
							segment <= value ? "bg-foreground/80" : "bg-foreground/15",
						)}
					/>
				))}
			</div>
		</div>
	);
}
