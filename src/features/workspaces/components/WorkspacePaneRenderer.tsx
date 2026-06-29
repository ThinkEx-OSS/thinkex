import WorkspaceContent from "#/features/workspaces/components/WorkspaceContent";
import type { WorkspacePaneRendererProps } from "#/features/workspaces/components/workspace-presentation-model";

export default function WorkspacePaneRenderer({
	aiContextScope,
	pane,
	scopedItems,
	workspace,
	onCreateItem,
	onOpenItem,
}: WorkspacePaneRendererProps) {
	switch (pane.kind) {
		case "item": {
			const item = aiContextScope.itemsById.get(pane.itemId);

			return (
				<WorkspaceContent
					workspace={workspace}
					items={scopedItems}
					activeItem={item}
					onCreateItem={onCreateItem}
					onOpenItem={onOpenItem}
				/>
			);
		}
		case "root":
			return (
				<WorkspaceContent
					workspace={workspace}
					items={scopedItems}
					activeItem={undefined}
					onCreateItem={onCreateItem}
					onOpenItem={onOpenItem}
				/>
			);
	}
}
