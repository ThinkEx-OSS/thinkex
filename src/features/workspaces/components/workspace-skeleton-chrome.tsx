import { CardHeader } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { cn } from "#/lib/utils";

/**
 * Tones for skeletons on a card surface. Skeleton's default `bg-muted` is
 * unusable there: in dark mode `--muted` and `--card` are both
 * `oklch(20.5% 0 0)`, so the block is exactly the card colour and the whole
 * placeholder reads as one filled slab. Alpha over `--foreground` contrasts in
 * both themes, and in light mode lands where `bg-muted` already was.
 */
export const workspaceSkeletonFieldClass = "bg-foreground/8";
export const workspaceSkeletonAccentClass = "bg-foreground/12";

/**
 * Title and meta bars, shared by the workspace and item card skeletons so the
 * two read as one family. `className` carries each card's own header padding.
 */
export function WorkspaceCardSkeletonHeader({ className }: { className?: string }) {
	return (
		// grid-cols-1 is load-bearing: CardHeader is a grid with an auto-sized
		// column, and these bars have no content to size it against, so their
		// percentage widths collapse to a sliver. The real cards size the track
		// with their own text. Heights track that text: CardTitle is
		// text-base/leading-normal, WorkspaceCardMetaRow is text-xs.
		<CardHeader className={cn("grid-cols-1", className)}>
			<Skeleton className={cn("h-6 w-3/4 rounded-sm", workspaceSkeletonAccentClass)} />
			<div className="flex items-center justify-between gap-2">
				<Skeleton className={cn("h-4 w-1/4 rounded-sm", workspaceSkeletonFieldClass)} />
				<Skeleton className={cn("h-4 w-1/3 rounded-sm", workspaceSkeletonFieldClass)} />
			</div>
		</CardHeader>
	);
}
