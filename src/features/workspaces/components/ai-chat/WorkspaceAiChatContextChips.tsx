import { Eye, MessageSquare, X } from "lucide-react";
import type { ComponentType } from "react";

import { Button } from "#/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import {
	getWorkspaceAiContextChips,
	type WorkspaceAiContextChip,
	type WorkspaceAiContextScope,
} from "#/features/workspaces/model/workspace-ai-context";
import type { WorkspaceSelectedQuote } from "#/features/workspaces/model/workspace-selected-quotes";
import { useWorkspaceAiComposerDraftStore } from "#/features/workspaces/state/workspace-ai-composer-draft-store";
import { useWorkspaceSelectionStore } from "#/features/workspaces/state/workspace-selection-store";
import { cn } from "#/lib/utils";

const CONTEXT_CHIP_REMOVE_BUTTON_CLASSNAME =
	"-mr-1 size-5 shrink-0 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive";

export default function WorkspaceAiChatContextChips({
	context,
}: {
	context: WorkspaceAiContextScope;
}) {
	const setSelectionItem = useWorkspaceSelectionStore((state) => state.setItemSelected);
	const removeQuote = useWorkspaceAiComposerDraftStore((state) => state.removeQuote);
	const chips = getWorkspaceAiContextChips(context);
	const activeChips = chips.filter((chip) => chip.isActiveVisible);
	const inactiveChips = chips.filter((chip) => !chip.isActiveVisible);
	const quoteChips = context.selectedQuotes;

	if (chips.length === 0 && quoteChips.length === 0) {
		return null;
	}

	return (
		<div className="flex w-full min-w-0 flex-wrap items-center gap-2">
			{activeChips.map((chip) => (
				<WorkspaceAiChatContextChipRenderer
					key={chip.id}
					chip={chip}
					onRemove={() =>
						setSelectionItem({
							workspaceId: context.workspaceId,
							itemId: chip.id,
							selected: false,
						})
					}
				/>
			))}
			{quoteChips.map((quote) => (
				<WorkspaceAiChatSelectedQuoteChip
					key={quote.id}
					quote={quote}
					onRemove={() => removeQuote(context.workspaceId, quote.id)}
				/>
			))}
			{inactiveChips.map((chip) => (
				<WorkspaceAiChatContextChipRenderer
					key={chip.id}
					chip={chip}
					onRemove={() =>
						setSelectionItem({
							workspaceId: context.workspaceId,
							itemId: chip.id,
							selected: false,
						})
					}
				/>
			))}
		</div>
	);
}

function WorkspaceAiChatContextChipRenderer({
	chip,
	onRemove,
}: {
	chip: WorkspaceAiContextChip;
	onRemove: () => void;
}) {
	return (
		<WorkspaceAiChatContextChip
			canRemove={chip.isSelected}
			isActiveVisible={chip.isActiveVisible}
			item={chip.item}
			label={chip.label}
			path={chip.path}
			viewStateLabel={chip.viewStateLabel}
			onRemove={onRemove}
		/>
	);
}

function WorkspaceAiChatContextChip({
	canRemove,
	isActiveVisible,
	item,
	label,
	path,
	viewStateLabel,
	onRemove,
}: {
	canRemove: boolean;
	isActiveVisible: boolean;
	item: WorkspaceItem;
	label: string;
	path: string;
	viewStateLabel?: string;
	onRemove: () => void;
}) {
	const { Icon, iconClassName } = getWorkspaceAiChatContextChipIcon(item);

	return (
		<div className={getWorkspaceAiChatContextChipClassName()} title={path}>
			<WorkspaceAiChatContextChipContent
				Icon={Icon}
				isActiveVisible={isActiveVisible}
				iconClassName={iconClassName}
				label={label}
				viewStateLabel={viewStateLabel}
			/>
			{canRemove ? (
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					className={CONTEXT_CHIP_REMOVE_BUTTON_CLASSNAME}
					aria-label={`Remove ${label} from selection`}
					onClick={onRemove}
				>
					<X className="size-3" />
				</Button>
			) : null}
		</div>
	);
}

function WorkspaceAiChatContextChipContent({
	Icon,
	isActiveVisible,
	iconClassName,
	label,
	viewStateLabel,
}: {
	Icon: ComponentType<{ className?: string }>;
	isActiveVisible: boolean;
	iconClassName?: string;
	label: string;
	viewStateLabel?: string;
}) {
	const LeadingIcon = isActiveVisible ? Eye : Icon;
	const leadingIconClassName = isActiveVisible ? "text-foreground" : iconClassName;

	return (
		<>
			<LeadingIcon
				className={cn("size-3 shrink-0 text-muted-foreground", leadingIconClassName)}
				aria-label={isActiveVisible ? "active item" : undefined}
			/>
			<span className="min-w-0 truncate font-medium">{label}</span>
			{viewStateLabel ? (
				<span className="shrink-0 tabular-nums text-muted-foreground">{viewStateLabel}</span>
			) : null}
		</>
	);
}

function WorkspaceAiChatSelectedQuoteChip({
	quote,
	onRemove,
}: {
	quote: WorkspaceSelectedQuote;
	onRemove: () => void;
}) {
	const preview = getWorkspaceAiChatSelectedQuotePreview(quote);
	const chip = (
		<div
			className={getWorkspaceAiChatContextChipClassName(
				"border border-blue-200/80 bg-blue-50 text-blue-950 dark:border-blue-500/25 dark:bg-blue-500/15 dark:text-blue-50",
			)}
		>
			<WorkspaceAiChatSelectedQuoteIcon />
			<span className="min-w-0 truncate font-medium">{preview}</span>
			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				className={CONTEXT_CHIP_REMOVE_BUTTON_CLASSNAME}
				aria-label={`Remove ${quote.label} from AI context`}
				onClick={onRemove}
			>
				<X className="size-3" />
			</Button>
		</div>
	);

	return (
		<Tooltip>
			<TooltipTrigger render={chip} />
			<TooltipContent className="block max-w-md whitespace-pre-wrap break-words text-left leading-relaxed">
				{quote.text}
			</TooltipContent>
		</Tooltip>
	);
}

function WorkspaceAiChatSelectedQuoteIcon() {
	return <MessageSquare className="size-3 shrink-0 text-blue-600 dark:text-blue-300" />;
}

function getWorkspaceAiChatSelectedQuotePreview(quote: WorkspaceSelectedQuote) {
	return quote.text.replace(/\s+/g, " ").trim();
}

function getWorkspaceAiChatContextChipIcon(item: WorkspaceItem): {
	Icon: ComponentType<{ className?: string }>;
	iconClassName?: string;
} {
	const { Icon, iconClassName } = getWorkspaceItemDisplay(item);

	return { Icon, iconClassName };
}

function getWorkspaceAiChatContextChipClassName(className?: string) {
	return cn(
		"flex min-h-6 min-w-0 max-w-48 items-center gap-1 rounded-md bg-muted px-1 py-0.5 text-xs dark:bg-input/30",
		"outline-none focus-visible:ring-2 focus-visible:ring-ring",
		className,
	);
}
