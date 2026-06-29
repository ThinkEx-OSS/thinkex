import type { WorkspaceItemType, WorkspaceSummary } from "#/features/workspaces/contracts";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import type { WorkspaceAiContextScope } from "#/features/workspaces/model/workspace-ai-context";
import type { WorkspacePane } from "#/features/workspaces/state/workspace-ui-store";

export interface WorkspacePresentationProps {
	aiContextScope: WorkspaceAiContextScope;
	scopedItems: WorkspaceItem[];
	workspace: WorkspaceSummary;
	onCreateItem: (input: { type: WorkspaceItemType; parentId: string | null }) => void;
	onOpenItem: (item: WorkspaceItem, options?: { background?: boolean }) => void;
}

export interface WorkspacePaneRendererProps extends WorkspacePresentationProps {
	pane: WorkspacePane;
}
