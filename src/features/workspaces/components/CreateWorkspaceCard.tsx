import { Plus } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Spinner } from "#/components/ui/spinner";
import { cn } from "#/lib/utils";

interface CreateWorkspaceCardProps {
	className?: string;
	disabled?: boolean;
	onCreate?: () => void;
	pending?: boolean;
}

export default function CreateWorkspaceCard({
	className,
	disabled = false,
	onCreate,
	pending = false,
}: CreateWorkspaceCardProps) {
	const isDisabled = disabled || pending;

	return (
		<Card
			className={cn(
				"group/card gap-0 overflow-hidden border-2 border-dashed border-muted-foreground/35 bg-transparent py-0 shadow-none ring-0 transition-[border-color,background-color] hover:border-foreground/35 hover:bg-muted/10 dark:border-muted-foreground/30 dark:bg-transparent dark:hover:bg-muted/10 sm:bg-muted/10 sm:hover:bg-muted/20 sm:dark:bg-muted/5 sm:dark:hover:bg-muted/10",
				className,
			)}
		>
			<button
				type="button"
				className="flex w-full cursor-pointer flex-row items-center rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:flex-col sm:items-stretch"
				disabled={isDisabled}
				aria-busy={pending}
				onClick={onCreate}
			>
				<div className="flex size-14 shrink-0 items-center justify-center sm:aspect-[5/2] sm:size-auto sm:w-full">
					{pending ? (
						<Spinner className="size-6 text-muted-foreground sm:size-11" />
					) : (
						<Plus
							className="size-6 text-muted-foreground transition-colors group-hover/card:text-foreground sm:size-11"
							strokeWidth={1.75}
						/>
					)}
				</div>

				<CardHeader className="min-w-0 flex-1 gap-1 px-3 py-2.5 sm:gap-2 sm:px-4 sm:py-3">
					<CardTitle>Create workspace</CardTitle>
					<CardDescription className="text-xs">
						{pending ? "Creating workspace..." : "Start something new"}
					</CardDescription>
				</CardHeader>
			</button>
		</Card>
	);
}
