import { Check, ChevronUp, Waypoints } from "lucide-react";
import { useMemo, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import {
	getWorkspaceAiChatModelById,
	WORKSPACE_AI_CHAT_MODELS,
	WORKSPACE_AI_CHAT_PROVIDERS,
	type WorkspaceAiChatModel,
	type WorkspaceAiChatModelId,
	type WorkspaceAiChatModelLevel,
} from "#/features/workspaces/ai/models";
import { ProviderLogo } from "#/features/workspaces/components/ai-chat/ProviderLogo";
import { cn } from "#/lib/utils";

const TRIGGER_CLASSNAME =
	"flex h-8.5 items-center gap-1.5 rounded-md px-2 text-sm font-normal text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:text-foreground";

interface AiChatModelPickerProps {
	modelId: WorkspaceAiChatModelId;
	onModelChange?: (modelId: WorkspaceAiChatModelId) => void;
}

export default function AiChatModelPicker({ modelId, onModelChange }: AiChatModelPickerProps) {
	const [open, setOpen] = useState(false);
	// The model whose details are shown in the side panel. Falls back to the
	// selected model whenever the pointer isn't over a list item, so quickly
	// dragging across the list just updates this one panel — no flicker, and
	// only ever one set of details visible at a time.
	const [previewId, setPreviewId] = useState<WorkspaceAiChatModelId | null>(null);

	const selectedModel = getWorkspaceAiChatModelById(modelId);
	const detailModel = getWorkspaceAiChatModelById(previewId ?? modelId);

	// The "Auto" option lives outside the provider groups — it's ThinkEx's own
	// choice, not a provider's model.
	const autoModel = WORKSPACE_AI_CHAT_MODELS.find((model) => model.provider === "auto");
	const groups = useMemo(
		() =>
			WORKSPACE_AI_CHAT_PROVIDERS.map((provider) => ({
				...provider,
				models: WORKSPACE_AI_CHAT_MODELS.filter((model) => model.provider === provider.id),
			})).filter((group) => group.models.length > 0),
		[],
	);

	const handleSelect = (nextId: WorkspaceAiChatModelId) => {
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
			<PopoverTrigger className={TRIGGER_CLASSNAME}>
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
					{autoModel ? (
						<div className="mb-1">
							<div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
								<Waypoints className="size-3.5 shrink-0" />
								Picks for you
							</div>
							<button
								type="button"
								onClick={() => handleSelect(autoModel.id)}
								onMouseEnter={() => setPreviewId(autoModel.id)}
								onFocus={() => setPreviewId(autoModel.id)}
								className={cn(
									"flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors",
									autoModel.id === (previewId ?? modelId)
										? "bg-accent text-accent-foreground"
										: "text-foreground hover:bg-accent/60",
								)}
							>
								<span className="truncate">{autoModel.name}</span>
								{autoModel.id === modelId ? (
									<Check className="ml-auto size-3.5 shrink-0 text-foreground" />
								) : null}
							</button>
						</div>
					) : null}
					{groups.map((group) => (
						<div key={group.id} className="mb-1 last:mb-0">
							<div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
								<ProviderLogo provider={group.id} className="size-3.5 opacity-65" />
								{group.label}
							</div>
							{group.models.map((model) => {
								const isSelected = model.id === modelId;
								const isPreviewing = model.id === (previewId ?? modelId);

								return (
									<button
										key={model.id}
										type="button"
										onClick={() => handleSelect(model.id)}
										onMouseEnter={() => setPreviewId(model.id)}
										onFocus={() => setPreviewId(model.id)}
										className={cn(
											"flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors",
											isPreviewing
												? "bg-accent text-accent-foreground"
												: "text-foreground hover:bg-accent/60",
										)}
									>
										<span className="truncate">{model.name}</span>
										{isSelected ? (
											<Check className="ml-auto size-3.5 shrink-0 text-foreground" />
										) : null}
									</button>
								);
							})}
						</div>
					))}
				</div>

				{/* Right: details for the hovered (or selected) model */}
				<ModelDetails model={detailModel} />
			</PopoverContent>
		</Popover>
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
				<div className="min-w-0">
					<div className="font-medium text-foreground">{model.name}</div>
				</div>
			</div>

			<p className="text-xs leading-relaxed text-muted-foreground">{model.description}</p>

			<div className="mt-auto flex flex-col gap-2 pt-3">
				<div className="rounded-md border border-border/70 bg-muted/60 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-input/40">
					<span className="text-muted-foreground">Great for </span>
					<span className="font-medium text-foreground">{model.bestFor}</span>
				</div>
				<StatBar label="Intelligence" value={model.intelligence} />
				<StatBar label="Speed" value={model.speed} />
				<StatBar label="Cost" value={model.cost} />
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
