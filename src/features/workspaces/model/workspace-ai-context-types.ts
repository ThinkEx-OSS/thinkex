import type { WorkspaceTab } from "#/features/workspaces/model/tab-types";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import type {
	WorkspaceAiContextItemViewState,
	WorkspaceItemViewState,
} from "#/features/workspaces/model/workspace-item-view-state";
import type { WorkspaceSelectedQuote } from "#/features/workspaces/model/workspace-selected-quotes";
import type { WorkspacePresentation } from "#/features/workspaces/state/workspace-ui-store";

export type WorkspaceAiContextScope = {
	activeItem?: WorkspaceItem;
	activeTabId?: string;
	itemViewStatesByItemId: Readonly<Record<string, WorkspaceItemViewState | undefined>>;
	itemsById: ReadonlyMap<string, WorkspaceItem>;
	presentation: WorkspacePresentation;
	selectedItemIds: readonly string[];
	selectedQuotes: WorkspaceSelectedQuote[];
	tabs: WorkspaceTab[];
	workspaceId: string;
	workspaceName: string;
};

export type WorkspaceAiContextSnapshot = {
	workspace: {
		name: string;
	};
	view: {
		activeItem?: WorkspaceAiContextItemReference;
		activeTab?: WorkspaceAiContextTabReference;
		presentation: WorkspaceAiContextPresentationReference;
	};
	selectedItems: WorkspaceAiContextSelectedItem[];
	openTabs: WorkspaceAiContextTabReference[];
	selectedQuotes: WorkspaceAiContextSnapshotSelectedQuote[];
	contentIncluded: false;
};

export type WorkspaceAiContextSnapshotSelectedQuote = {
	label: string;
	order: number;
	source:
		| {
				kind: "assistant-response";
		  }
		| {
				kind: "document-selection";
				item?: WorkspaceAiContextItemReference;
		  }
		| {
				kind: "pdf-selection";
				item?: WorkspaceAiContextItemReference;
				pageNumbers: number[];
		  };
	text: string;
};

export type WorkspaceAiContextSelectedItem = WorkspaceAiContextItemReference & {
	availableToAi: true;
	selectedForAiContext: true;
	order: number;
};

export type WorkspaceAiContextItemReference = {
	name: string;
	path: string;
	type: string;
	state: {
		activeVisible: boolean;
		viewState?: WorkspaceAiContextItemViewState;
		openInTabs: string[];
	};
};

export type WorkspaceAiContextTabReference = {
	title: string;
	active: boolean;
	view:
		| { kind: "workspace-root" }
		| {
				kind: "workspace-item";
				item: WorkspaceAiContextItemReference;
		  }
		| { kind: "missing-item" };
};

export type WorkspaceAiContextPresentationReference =
	| { mode: "standard"; activePane?: WorkspaceAiContextPaneReference }
	| {
			mode: "split";
			direction: "horizontal" | "vertical";
			activePane?: WorkspaceAiContextPaneReference;
			panes: WorkspaceAiContextPaneReference[];
	  }
	| {
			mode: "maximized";
			activePane: WorkspaceAiContextPaneReference;
			restoreMode: "standard" | "split";
	  };

export type WorkspaceAiContextPaneReference =
	| { kind: "workspace-root" }
	| { kind: "ai-chat" }
	| {
			kind: "workspace-item";
			item: WorkspaceAiContextItemReference;
	  }
	| { kind: "missing-item" };

export type WorkspaceAiContextChip = {
	id: string;
	item: WorkspaceItem;
	isActiveVisible: boolean;
	isSelected: boolean;
	label: string;
	path: string;
	viewStateLabel?: string;
};
