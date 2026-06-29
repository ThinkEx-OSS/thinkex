import { Camera, Download, EllipsisVertical } from "lucide-react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	WorkspaceToolbarGroup,
	WorkspaceToolbarIconButton,
	WorkspaceToolbarTextButton,
} from "#/features/workspaces/components/WorkspaceToolbar";
import { cn } from "#/lib/utils";

export function WorkspaceFileToolbar({
	capture,
	fileName,
	fileUrl,
}: {
	capture: {
		isActive: boolean;
		onToggle: () => void;
	};
	fileName: string;
	fileUrl: string;
}) {
	const handleDownload = () => {
		const link = document.createElement("a");
		link.href = fileUrl;
		link.download = fileName;
		document.body.appendChild(link);
		link.click();
		link.remove();
	};

	return (
		<WorkspaceToolbarGroup scrollable>
			<WorkspaceToolbarTextButton
				className={cn(
					capture.isActive
						? "bg-blue-500/10 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
						: undefined,
				)}
				aria-pressed={capture.isActive}
				onClick={capture.onToggle}
			>
				<Camera />
				Capture
			</WorkspaceToolbarTextButton>
			<DropdownMenu>
				<DropdownMenuTrigger render={<WorkspaceToolbarIconButton aria-label="More file actions" />}>
					<EllipsisVertical />
				</DropdownMenuTrigger>
				<DropdownMenuContent className="w-48" align="end">
					<DropdownMenuItem
						className="[&_svg:not([class*='size-'])]:size-4"
						onClick={handleDownload}
					>
						<span className="inline-flex size-4 items-center justify-center text-muted-foreground">
							<Download />
						</span>
						Download file
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</WorkspaceToolbarGroup>
	);
}
