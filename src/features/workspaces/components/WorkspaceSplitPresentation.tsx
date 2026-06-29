import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "#/components/ui/resizable";
import WorkspacePaneRenderer from "#/features/workspaces/components/WorkspacePaneRenderer";
import type { WorkspacePresentationProps } from "#/features/workspaces/components/workspace-presentation-model";
import type { WorkspacePane } from "#/features/workspaces/state/workspace-ui-store";

export default function WorkspaceSplitPresentation({
	aiContextScope,
	panes,
	direction,
	scopedItems,
	workspace,
	onCreateItem,
	onOpenItem,
}: WorkspacePresentationProps & {
	panes: [WorkspacePane, WorkspacePane];
	direction: "horizontal" | "vertical";
}) {
	return (
		<ResizablePanelGroup
			id="workspace-split-presentation"
			orientation={direction}
			className="h-full min-h-0"
		>
			<ResizablePanel id={panes[0].id} minSize="18rem">
				<WorkspacePaneRenderer
					aiContextScope={aiContextScope}
					pane={panes[0]}
					scopedItems={scopedItems}
					workspace={workspace}
					onCreateItem={onCreateItem}
					onOpenItem={onOpenItem}
				/>
			</ResizablePanel>
			<ResizableHandle withHandle={true} />
			<ResizablePanel id={panes[1].id} minSize="18rem">
				<WorkspacePaneRenderer
					aiContextScope={aiContextScope}
					pane={panes[1]}
					scopedItems={scopedItems}
					workspace={workspace}
					onCreateItem={onCreateItem}
					onOpenItem={onOpenItem}
				/>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
