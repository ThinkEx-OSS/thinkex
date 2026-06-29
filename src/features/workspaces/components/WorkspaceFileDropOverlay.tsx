import { Upload } from "lucide-react";

export function WorkspaceFileDropOverlay({
	description,
	title,
}: {
	description: string;
	title: string;
}) {
	return (
		<div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/80 p-6 backdrop-blur-[2px]">
			<div className="flex min-h-40 w-full max-w-md flex-col items-center justify-center gap-3 rounded-md border border-foreground/35 border-dashed bg-card/90 px-6 py-8 text-center shadow-lg ring-1 ring-foreground/15">
				<div className="flex size-11 items-center justify-center rounded-md bg-muted text-foreground">
					<Upload className="size-5" aria-hidden="true" />
				</div>
				<div className="space-y-1">
					<p className="font-medium text-foreground text-sm">{title}</p>
					<p className="text-muted-foreground text-xs">{description}</p>
				</div>
			</div>
		</div>
	);
}
