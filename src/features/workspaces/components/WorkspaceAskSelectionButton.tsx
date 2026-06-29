import { MessageSquare } from "lucide-react";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

export function WorkspaceAskSelectionButton({
	className,
	onClick,
}: {
	className?: string;
	onClick: () => void;
}) {
	return (
		<Button
			type="button"
			variant="default"
			size="xs"
			className={cn(
				"workspace-ask-selection-button h-8 gap-1.5 border-blue-600 bg-blue-600 px-2.5 text-sm text-white shadow-lg hover:bg-blue-700 focus-visible:border-blue-400 focus-visible:ring-blue-500/40",
				className,
			)}
			onClick={onClick}
			onMouseDown={(event) => event.preventDefault()}
		>
			<MessageSquare className="size-4" />
			Chat
		</Button>
	);
}
