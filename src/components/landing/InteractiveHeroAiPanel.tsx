import { ArrowUp, Check, ChevronUp, FileSearch, Mic, Paperclip, Waypoints, X } from "lucide-react";
import { useState } from "react";

import {
	DemoToolbarGroup,
	DemoToolbarIconButton,
	DemoToolbarTextButton,
} from "#/components/landing/InteractiveHeroChrome";
import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import { cn } from "#/lib/utils";

const MODELS = ["Auto", "GPT-5", "Claude Sonnet", "Gemini Pro"] as const;

/** Lightweight AI chat simulation for the public workspace preview. */
export function InteractiveHeroAiPanel({
	contextItems,
	notesItem,
	onClose,
	onOpenNotes,
	onOpenSource,
	onPreviewGate,
	onRemoveContext,
	selectedItemIds,
	sourceItem,
}: {
	readonly contextItems: readonly WorkspaceItem[];
	readonly notesItem: WorkspaceItem;
	readonly onClose?: () => void;
	readonly onOpenNotes: () => void;
	readonly onOpenSource: () => void;
	readonly onPreviewGate: () => void;
	readonly onRemoveContext: (itemId: string) => void;
	readonly selectedItemIds: ReadonlySet<string>;
	readonly sourceItem: WorkspaceItem;
}) {
	const [model, setModel] = useState<(typeof MODELS)[number]>("Auto");
	const [modelPickerOpen, setModelPickerOpen] = useState(false);
	const sourceDisplay = getWorkspaceItemDisplay(sourceItem);
	const SourceCitationIcon = sourceDisplay.Icon;
	const notesDisplay = getWorkspaceItemDisplay(notesItem);
	const NotesCitationIcon = notesDisplay.Icon;

	return (
		<div className="flex h-full min-h-0 flex-col bg-background">
			{onClose ? (
				<div className="flex h-11 shrink-0 items-center justify-between border-b px-4">
					<span className="text-sm font-medium">AI Chat</span>
					<DemoToolbarIconButton onClick={onClose} aria-label="Close AI chat">
						<X />
					</DemoToolbarIconButton>
				</div>
			) : null}
			<div className="min-h-0 flex-1 overflow-y-auto px-4 pt-10 pb-5">
				<div className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-3 text-sm leading-6 text-white">
					Can you explain what controls the cell cycle using my course sources?
				</div>
				<div className="mt-4 space-y-1 text-xs text-muted-foreground">
					<div className="flex min-w-0 items-center gap-1.5 py-0.5">
						<FileSearch className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
						<span className="min-w-0 truncate font-medium">
							Searched “cell-cycle control” across 2 sources
						</span>
					</div>
					<div className="flex min-w-0 items-center gap-1.5 py-0.5">
						<FileSearch className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
						<span className="min-w-0 truncate font-medium">
							Read “{notesItem.name}” and “{sourceItem.name}”
						</span>
					</div>
				</div>
				<div className="mt-3 text-sm leading-6">
					<p>
						<strong>The short version:</strong> cyclins act like timers. Their levels rise and fall,
						activating cyclin-dependent kinases that move the cell forward. Checkpoints pause that
						progress when DNA is damaged or replication is incomplete.
					</p>
					<button
						type="button"
						onClick={onOpenNotes}
						className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-sm bg-muted px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
					>
						<NotesCitationIcon className={cn("size-3.5 shrink-0", notesDisplay.iconClassName)} />
						<span className="truncate">{notesItem.name}</span>
					</button>
					<p className="mt-3">
						Once the cell proceeds into mitosis, duplicated chromosomes align and sister chromatids
						are pulled to opposite ends before the cell divides.
					</p>
					<button
						type="button"
						onClick={onOpenSource}
						className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-sm bg-muted px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
					>
						<SourceCitationIcon className={cn("size-3.5 shrink-0", sourceDisplay.iconClassName)} />
						<span className="truncate">{sourceItem.name}</span>
						<span className="shrink-0 opacity-70">· p. 177</span>
					</button>
					<p className="mt-3">
						For an exam:{" "}
						<strong>
							cyclins activate CDKs, and checkpoints decide whether the cell can proceed.
						</strong>
					</p>
				</div>
			</div>
			<div className="shrink-0 px-3 pb-3">
				<form
					className="mx-auto flex w-full max-w-3xl flex-col rounded-xl border border-border/70 bg-muted/30"
					onSubmit={(event) => {
						event.preventDefault();
						onPreviewGate();
					}}
				>
					{contextItems.length > 0 ? (
						<div className="flex min-w-0 flex-wrap gap-1.5 px-3.5 pt-3 pb-1">
							{contextItems.map((item) => {
								const display = getWorkspaceItemDisplay(item);
								const ItemIcon = display.Icon;
								return (
									<span
										key={item.id}
										className="flex min-w-0 max-w-full items-center gap-1 rounded-md bg-background px-2 py-1 text-xs ring-1 ring-border/70"
									>
										<ItemIcon className={cn("size-3.5 shrink-0", display.iconClassName)} />
										<span className="truncate">{item.name}</span>
										{selectedItemIds.has(item.id) ? (
											<button
												type="button"
												aria-label={`Remove ${item.name} from selection`}
												onClick={() => onRemoveContext(item.id)}
												className="ml-0.5 text-muted-foreground hover:text-foreground"
											>
												<X className="size-3" />
											</button>
										) : null}
									</span>
								);
							})}
						</div>
					) : null}
					<textarea
						name="message"
						rows={1}
						placeholder="Ask anything"
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
								event.preventDefault();
								event.currentTarget.form?.requestSubmit();
							}
						}}
						className="min-h-10 max-h-32 w-full resize-none overflow-y-auto bg-transparent px-3.5 pt-2 pb-1 text-base outline-none [field-sizing:content] placeholder:text-foreground/45"
					/>
					<div className="flex items-center pt-1 pr-3.5 pb-2 pl-2">
						<DemoToolbarGroup>
							<DemoToolbarIconButton aria-label="Add attachments" onClick={onPreviewGate}>
								<Paperclip />
							</DemoToolbarIconButton>
							<div className="relative">
								<DemoToolbarTextButton
									aria-expanded={modelPickerOpen}
									onClick={() => setModelPickerOpen((open) => !open)}
									className="max-w-40 px-2 font-normal"
								>
									<span className="truncate">{model}</span>
									<ChevronUp className="size-3.5 opacity-60" />
								</DemoToolbarTextButton>
								{modelPickerOpen ? (
									<div className="absolute bottom-10 left-0 z-30 w-48 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg">
										<p className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">
											<Waypoints className="size-3.5" /> Choose a model
										</p>
										{MODELS.map((option) => (
											<button
												type="button"
												key={option}
												onClick={() => {
													setModel(option);
													setModelPickerOpen(false);
												}}
												className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
											>
												<span className="grid size-3.5 place-items-center">
													{model === option ? <Check className="size-3.5" /> : null}
												</span>
												{option}
											</button>
										))}
									</div>
								) : null}
							</div>
						</DemoToolbarGroup>
						<DemoToolbarGroup className="ml-auto">
							<DemoToolbarIconButton aria-label="Start dictation" onClick={onPreviewGate}>
								<Mic />
							</DemoToolbarIconButton>
							<DemoToolbarIconButton
								type="submit"
								aria-label="Submit"
								className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
							>
								<ArrowUp />
							</DemoToolbarIconButton>
						</DemoToolbarGroup>
					</div>
				</form>
			</div>
		</div>
	);
}
