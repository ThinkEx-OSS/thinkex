import AppShell from "#/components/AppShell";
import CreateWorkspaceCard from "#/features/workspaces/components/CreateWorkspaceCard";
import WorkspaceCardSkeleton from "#/features/workspaces/components/WorkspaceCardSkeleton";
import { WorkspaceGrid } from "#/features/workspaces/components/WorkspaceGrid";

const homeWorkspaceSkeletonCardIds = ["recent", "research", "notes"] as const;

export function WorkspaceHomePageSkeleton() {
	return (
		<AppShell>
			<div className="pb-8">
				<WorkspaceGrid>
					<CreateWorkspaceCard disabled={true} />
					{homeWorkspaceSkeletonCardIds.map((id) => (
						<WorkspaceCardSkeleton key={id} />
					))}
				</WorkspaceGrid>
			</div>
		</AppShell>
	);
}
