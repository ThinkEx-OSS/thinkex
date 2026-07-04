import { Card, CardHeader, CardTitle } from "#/components/ui/card";
import CreateWorkspaceCard from "#/features/workspaces/components/CreateWorkspaceCard";
import { WorkspaceGrid } from "#/features/workspaces/components/WorkspaceGrid";
import { WorkspaceCardMetaRow } from "#/features/workspaces/components/workspace-card-meta-row";
import type { WorkspaceColor, WorkspaceIcon } from "#/features/workspaces/contracts";
import { workspaceColors } from "#/features/workspaces/model/workspace-colors";
import { workspaceIcons } from "#/features/workspaces/model/workspace-icons";
import { cn } from "#/lib/utils";

interface ExampleWorkspace {
	name: string;
	icon: WorkspaceIcon;
	color: WorkspaceColor;
	role: string;
	recency: string;
}

const exampleWorkspaces: readonly ExampleWorkspace[] = [
	{ name: "Algebra II", icon: "sigma", color: "sky", role: "Owner", recency: "Opened 2h ago" },
	{
		name: "Research Paper",
		icon: "microscope",
		color: "violet",
		role: "Editor",
		recency: "Opened yesterday",
	},
	{
		name: "Business Ideas",
		icon: "lightbulb",
		color: "emerald",
		role: "Viewer",
		recency: "Opened 3 days ago",
	},
];

interface WorkspaceHomeEmptyStateProps {
	onCreate?: () => void;
	pending?: boolean;
}

export default function WorkspaceHomeEmptyState({
	onCreate,
	pending = false,
}: WorkspaceHomeEmptyStateProps) {
	return (
		<WorkspaceGrid>
			<CreateWorkspaceCard onCreate={onCreate} pending={pending} />
			{exampleWorkspaces.map((example) => (
				<WorkspaceExampleCard key={example.name} example={example} />
			))}
		</WorkspaceGrid>
	);
}

function WorkspaceExampleCard({ example }: { example: ExampleWorkspace }) {
	const Icon = workspaceIcons[example.icon];
	const color = workspaceColors[example.color];

	return (
		<Card
			aria-hidden="true"
			className="pointer-events-none select-none gap-0 overflow-hidden border border-dashed border-muted-foreground/25 bg-transparent py-0 opacity-60 shadow-none ring-0 dark:border-muted-foreground/20"
		>
			<div className="flex w-full flex-row items-center rounded-xl text-left sm:flex-col sm:items-stretch">
				<div className="flex size-14 shrink-0 items-center justify-center sm:hidden">
					<div
						className={cn(
							"flex size-9 items-center justify-center rounded-md opacity-50",
							color.surfaceClassName,
						)}
					>
						<Icon className={cn("size-5", color.iconClassName)} strokeWidth={1.75} />
					</div>
				</div>

				<div
					className={cn(
						"hidden aspect-[5/2] w-full items-center justify-center opacity-45 sm:flex",
						color.chromeClassName,
					)}
				>
					<Icon className={cn("size-11", color.iconClassName)} strokeWidth={1.75} />
				</div>

				<CardHeader className="min-w-0 flex-1 gap-1 px-3 py-2.5 sm:gap-2 sm:px-4 sm:py-3">
					<CardTitle className="truncate font-medium text-muted-foreground/55">
						{example.name}
					</CardTitle>
					<div className="[&>div]:text-muted-foreground/55">
						<WorkspaceCardMetaRow leading={example.role} trailing={example.recency} />
					</div>
				</CardHeader>
			</div>
		</Card>
	);
}
