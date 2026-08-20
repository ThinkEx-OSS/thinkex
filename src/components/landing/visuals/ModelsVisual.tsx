import { useLayoutEffect, useRef, useState } from "react";

import {
	getWorkspaceAiChatModelById,
	WORKSPACE_AI_CHAT_MODELS,
	WORKSPACE_AI_CHAT_PROVIDERS,
	type WorkspaceAiChatModelId,
	type WorkspaceAiChatModelLevel,
} from "#/features/workspaces/ai/models";
import { ProviderLogo } from "#/features/workspaces/components/ai-chat/ProviderLogo";
import { cn } from "#/lib/utils";

/**
 * The in-app model picker, list on the left and detail on the right.
 */
const MODEL_GROUPS = WORKSPACE_AI_CHAT_PROVIDERS.map((provider) => ({
	id: provider.id,
	label: provider.label,
	models: WORKSPACE_AI_CHAT_MODELS.filter((model) => model.provider === provider.id),
})).filter((group) => group.models.length > 0);

export function ModelsVisual() {
	const [selectedModelId, setSelectedModelId] = useState<WorkspaceAiChatModelId>("gpt-terra");
	const listRef = useRef<HTMLDivElement | null>(null);
	const rowRefs = useRef<Partial<Record<WorkspaceAiChatModelId, HTMLButtonElement | null>>>({});
	const [activeIndicator, setActiveIndicator] = useState({ height: 0, top: 0 });
	// Derived from the registry rather than restated, so a new provider or model
	// shows up here without an edit. Hoisted out of render: it is constant.
	const detailModel = getWorkspaceAiChatModelById(selectedModelId);
	const detailProvider = detailModel.provider === "auto" ? null : detailModel.provider;

	// Layout effect so the bar is placed before paint, and observed so it does not
	// go stale when the card is resized by its grid, a font load, or zoom.
	useLayoutEffect(() => {
		const listElement = listRef.current;

		if (!listElement) {
			return;
		}

		const measure = () => {
			const rowElement = rowRefs.current[selectedModelId];

			if (!rowElement) {
				return;
			}

			const listRect = listElement.getBoundingClientRect();
			const rowRect = rowElement.getBoundingClientRect();

			setActiveIndicator({
				height: rowRect.height,
				top: rowRect.top - listRect.top + listElement.scrollTop,
			});
		};

		measure();

		const observer = new ResizeObserver(measure);
		observer.observe(listElement);

		return () => observer.disconnect();
	}, [selectedModelId]);

	return (
		<div className="grid h-full min-h-52 w-full grid-cols-[minmax(0,max-content)_minmax(0,1fr)] overflow-hidden">
			<div
				ref={listRef}
				className="relative min-w-0 overflow-y-auto border-border/60 border-r pr-1.5"
			>
				<div
					className="pointer-events-none absolute right-1.5 left-0 rounded-md bg-accent transition-[transform,height,opacity] duration-150 ease-out"
					style={{
						height: activeIndicator.height,
						opacity: activeIndicator.height > 0 ? 1 : 0,
						transform: `translateY(${activeIndicator.top}px)`,
					}}
				/>
				{MODEL_GROUPS.map((group, groupIndex) => (
					<div
						key={group.id}
						className={cn("relative", groupIndex > 0 && "mt-2 border-border/60 border-t pt-2")}
					>
						<div className="flex items-center gap-1.5 px-3 pb-1 text-xs font-medium text-muted-foreground">
							<ProviderLogo provider={group.id} className="size-3.5 shrink-0 opacity-65" />
							{group.label}
						</div>
						{group.models.map((model) => {
							const isSelected = model.id === selectedModelId;

							return (
								<button
									key={model.id}
									type="button"
									ref={(element) => {
										rowRefs.current[model.id] = element;
									}}
									onClick={() => setSelectedModelId(model.id)}
									onMouseEnter={() => setSelectedModelId(model.id)}
									onFocus={() => setSelectedModelId(model.id)}
									className={cn(
										"relative z-10 flex w-full min-w-0 cursor-default items-center gap-3 rounded-md px-3 py-1.5 text-left outline-none transition-colors duration-100",
										isSelected
											? "text-accent-foreground"
											: "text-foreground hover:text-accent-foreground focus-visible:text-accent-foreground",
									)}
								>
									<div className="min-w-0 truncate text-sm font-medium">{model.name}</div>
								</button>
							);
						})}
					</div>
				))}
			</div>
			<div className="flex min-w-0 flex-col gap-3 py-2 pl-2.5">
				<div className="flex min-w-0 items-center gap-2">
					{detailProvider ? (
						<ProviderLogo provider={detailProvider} className="size-5 shrink-0 opacity-75" />
					) : null}
					{/* No truncate: the tier lives on its own row below, so the name owns
					    the full width. Mirrors the in-app model picker. */}
					<div className="min-w-0 text-base font-medium">{detailModel.name}</div>
				</div>
				<p className="line-clamp-4 text-sm leading-6 text-muted-foreground">
					{detailModel.description}
				</p>
				{/* `mt-auto` lives on the wrapper so the stats stay pinned to the bottom
				    however tall the description above them runs. */}
				<div className="mt-auto grid gap-3">
					<ModelStatBar label="Intelligence" value={detailModel.intelligence} />
					<ModelStatBar label="Speed" value={detailModel.speed} />
				</div>
			</div>
		</div>
	);
}

function ModelStatBar({ label, value }: { label: string; value: WorkspaceAiChatModelLevel }) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="text-[0.68rem] text-muted-foreground">{label}</span>
			<div className="flex gap-1">
				{[1, 2, 3, 4].map((segment) => (
					<span
						key={segment}
						className={cn(
							"h-1.5 w-3 rounded-full sm:w-4",
							segment <= value ? "bg-foreground/80" : "bg-foreground/15",
						)}
					/>
				))}
			</div>
		</div>
	);
}
