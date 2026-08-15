import type { WorkspaceItem, WorkspaceSummary } from "#/features/workspaces/contracts";
import type { WorkspaceAiContextScope } from "#/features/workspaces/model/workspace-ai-context-types";
import type { WorkspacePane } from "#/features/workspaces/state/workspace-ui-store";

export interface WorkspacePresentationProps {
	aiContextScope: WorkspaceAiContextScope;
	scopedItems: WorkspaceItem[];
	workspace: WorkspaceSummary;
	onCreateItem: (input: WorkspaceCreateItemRequest) => void;
	onOpenItem: (item: WorkspaceItem, options?: { background?: boolean }) => void;
}

export interface WorkspaceCreateItemRequest {
	type: "document" | "flashcard" | "folder" | "quiz";
	parentId: string | null;
}

export interface WorkspacePaneRendererProps extends WorkspacePresentationProps {
	pane: WorkspacePane;
}
