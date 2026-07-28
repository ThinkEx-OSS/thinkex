import { toast } from "sonner";

import type { WorkspaceLocation } from "#/features/workspaces/locations/workspace-location";
import { useWorkspaceLocationActions } from "#/features/workspaces/locations/workspace-location-context";
import { cn } from "#/lib/utils";

export function WorkspaceCitation({ location }: { readonly location: WorkspaceLocation }) {
	const { getPresentation, reveal } = useWorkspaceLocationActions();
	const { Icon, iconClassName, label, locatorLabel } = getPresentation(location);
	const accessibleLabel = locatorLabel ? `${label} · ${locatorLabel}` : label;

	return (
		<button
			type="button"
			aria-label={`Open ${accessibleLabel}`}
			title={accessibleLabel}
			className="mx-0.5 inline-flex max-w-48 cursor-pointer items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 align-baseline font-medium text-[0.72em] text-muted-foreground leading-none transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
