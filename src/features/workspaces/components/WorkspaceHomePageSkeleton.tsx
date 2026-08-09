import AppShell from "#/components/AppShell";
import CreateWorkspaceCard from "#/features/workspaces/components/CreateWorkspaceCard";
import WorkspaceCardSkeleton from "#/features/workspaces/components/WorkspaceCardSkeleton";
import { WorkspaceGrid } from "#/features/workspaces/components/WorkspaceGrid";

const homeWorkspaceSkeletonCardKeys = [0, 1, 2];

export function WorkspaceHomePageSkeleton() {
	return (
		<AppShell>
			<div className="pb-8">
				<WorkspaceGrid>
					<CreateWorkspaceCard disabled={true} />
					{homeWorkspaceSkeletonCardKeys.map((key) => (
						<WorkspaceCardSkeleton key={key} />
					))}
				</WorkspaceGrid>
			</div>
		</AppShell>
	);
}
