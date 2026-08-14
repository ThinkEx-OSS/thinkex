import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { flashcardViewerQueryOptions } from "#/features/workspaces/flashcards/flashcard-queries";
import type { WorkspaceLocation } from "#/features/workspaces/locations/workspace-location";
import { useWorkspaceLocationActions } from "#/features/workspaces/locations/workspace-location-context";
import { cn } from "#/lib/utils";

export function WorkspaceCitation({ location }: { readonly location: WorkspaceLocation }) {
	const item = useWorkspaceLocationActions().getItem(location.itemId);

	return location.kind === "flashcard" && item?.type === "flashcard" ? (
		<FlashcardCitation item={item} location={location} />
	) : (
		<CitationButton location={location} />
	);
}

function FlashcardCitation({
	item,
	location,
}: {
	item: WorkspaceItem;
	location: Extract<WorkspaceLocation, { kind: "flashcard" }>;
}) {
	const { data: cardNumber } = useQuery({
		...flashcardViewerQueryOptions({
			itemId: item.id,
			updatedAt: item.updatedAt,
			workspaceId: item.workspaceId,
		}),
		select: ({ cards }) => cards.findIndex((card) => card.id === location.cardId) + 1,
	});

	return (
		<CitationButton
			location={location}
			locatorLabel={cardNumber ? `Card ${cardNumber}` : undefined}
		/>
	);
}

function CitationButton({
	location,
	locatorLabel,
}: {
	location: WorkspaceLocation;
	locatorLabel?: string;
}) {
	const { getPresentation, reveal } = useWorkspaceLocationActions();
	const {
		Icon,
		iconClassName,
		label,
		locatorLabel: defaultLocatorLabel,
	} = getPresentation(location);
	locatorLabel ??= defaultLocatorLabel;
	const accessibleLabel = locatorLabel ? `${label} · ${locatorLabel}` : label;

	return (
		<button
			type="button"
			aria-label={`Open ${accessibleLabel}`}
			title={accessibleLabel}
			className="mx-0.5 inline-flex max-w-48 cursor-pointer items-center gap-1 rounded-sm bg-muted px-1.5 py-1 align-baseline font-medium text-[0.72em] text-muted-foreground leading-none transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			onClick={() => {
				if (!reveal(location)) {
					toast.error("This source is no longer available.");
				}
			}}
		>
			<Icon
				className={cn("size-3 shrink-0", iconClassName)}
				strokeWidth={1.75}
				aria-hidden="true"
			/>
			<span className="min-w-0 truncate">{label}</span>
			{locatorLabel ? <span className="shrink-0 tabular-nums">· {locatorLabel}</span> : null}
		</button>
	);
}
