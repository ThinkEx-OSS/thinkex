import type { WorkspaceTab } from "#/features/workspaces/model/tab-types";
import {
	createWorkspaceReferenceRegistry,
	type WorkspaceReferenceRegistry,
} from "#/features/workspaces/ai/workspace-reference";
import type { WorkspaceLocation } from "#/features/workspaces/locations/workspace-location";
import type {
	WorkspacePane,
	WorkspacePresentation,
} from "#/features/workspaces/state/workspace-ui-store";

import {
	getOpenTabItemIds,
	getWorkspaceAiContextItemReference,
	getWorkspaceAiContextVisibleItemIds,
} from "./workspace-ai-context-reference";
import { buildWorkspaceAiContextOutline } from "./workspace-ai-context-outline";
import type {
	WorkspaceAiContextPaneReference,
	WorkspaceAiContextPresentationReference,
	WorkspaceAiContextScope,
	WorkspaceAiContextSnapshot,
	WorkspaceAiContextSnapshotSelectedQuote,
	WorkspaceAiContextTabReference,
} from "./workspace-ai-context-types";
import type { WorkspaceSelectedQuote } from "./workspace-selected-quotes";

type WorkspaceAiContextSnapshotBuildContext = {
	context: WorkspaceAiContextScope;
	openTabItemIds: ReadonlyMap<string, string[]>;
	visibleItemIds: ReadonlySet<string>;
};

export function buildWorkspaceAiContextSnapshot(
	context: WorkspaceAiContextScope,
): WorkspaceAiContextSnapshot {
	const openTabItemIds = getOpenTabItemIds(context.tabs);
	const visibleItemIds = getWorkspaceAiContextVisibleItemIds(context);
	const buildContext = { context, openTabItemIds, visibleItemIds };
	const citationRegistry = createWorkspaceReferenceRegistry();
	const activeItem =
		context.activeItem && context.itemsById.has(context.activeItem.id)
			? context.activeItem
			: undefined;

	return {
		workspace: {
			name: context.workspaceName,
			outline: buildWorkspaceAiContextOutline(context),
		},
		view: {
			activeItem: activeItem
				? getWorkspaceAiContextItemReference({
						...buildContext,
						item: activeItem,
					})
				: undefined,
			activeTab: getOptionalWorkspaceAiContextTabReference(
				context.tabs.find((tab) => tab.id === context.activeTabId),
				buildContext,
			),
			presentation: getWorkspaceAiContextPresentationReference(context.presentation, buildContext),
		},
		selectedItems: context.selectedItemIds.flatMap((itemId, index) => {
			const item = context.itemsById.get(itemId);

			if (!item) {
				return [];
			}

			return [
				{
					...getWorkspaceAiContextItemReference({
						...buildContext,
						item,
					}),
					availableToAi: true as const,
					selectedForAiContext: true as const,
					order: index + 1,
				},
			];
		}),
		openTabs: context.tabs.map((tab) => getWorkspaceAiContextTabReference(tab, buildContext)),
		selectedQuotes: context.selectedQuotes.map((quote, index) =>
			getWorkspaceAiContextSelectedQuoteReference({
				buildContext,
				citationRegistry,
				order: index + 1,
				quote,
			}),
		),
		contentIncluded: false,
	};
}

function getWorkspaceAiContextSelectedQuoteReference(input: {
	buildContext: WorkspaceAiContextSnapshotBuildContext;
	citationRegistry: WorkspaceReferenceRegistry;
	order: number;
	quote: WorkspaceSelectedQuote;
}): WorkspaceAiContextSnapshotSelectedQuote {
	const { buildContext, citationRegistry, order, quote } = input;
	const { context } = buildContext;

	if (quote.source.kind === "assistant-response") {
		return {
			label: quote.label,
			order,
			source: {
				kind: "assistant-response",
			},
			text: quote.text,
		};
	}

	if (quote.source.kind === "document-selection") {
		const item = context.itemsById.get(quote.source.itemId);
		const citation = item
			? createSelectedQuoteCitation(citationRegistry, {
					itemId: item.id,
					kind: "item",
					version: 1,
				})
			: undefined;

		return {
			...(citation ? { citation } : {}),
			label: quote.label,
			order,
			source: {
				kind: "document-selection",
				item: item
					? getWorkspaceAiContextItemReference({
							...buildContext,
							item,
						})
					: undefined,
			},
			text: quote.text,
		};
	}

	const item = context.itemsById.get(quote.source.itemId);
	const firstPage = quote.source.pageNumbers[0];
	const citation = item
		? createSelectedQuoteCitation(
				citationRegistry,
				firstPage
					? {
							itemId: item.id,
							kind: "pdf-page",
							pageNumber: firstPage,
							version: 1,
						}
					: {
							itemId: item.id,
							kind: "item",
							version: 1,
						},
			)
		: undefined;

	return {
		...(citation ? { citation } : {}),
		label: quote.label,
		order,
		source: {
			kind: "pdf-selection",
			item: item
				? getWorkspaceAiContextItemReference({
						...buildContext,
						item,
					})
				: undefined,
			pageNumbers: quote.source.pageNumbers,
		},
		text: quote.text,
	};
}

function createSelectedQuoteCitation(
	registry: WorkspaceReferenceRegistry,
	location: WorkspaceLocation,
) {
	return {
		location,
		ref: registry.getOrCreate(location),
	};
}

function getOptionalWorkspaceAiContextTabReference(
	tab: WorkspaceTab | undefined,
	buildContext: WorkspaceAiContextSnapshotBuildContext,
) {
	if (!tab) {
		return undefined;
	}

	return getWorkspaceAiContextTabReference(tab, buildContext);
}

function getWorkspaceAiContextTabReference(
	tab: WorkspaceTab,
	buildContext: WorkspaceAiContextSnapshotBuildContext,
): WorkspaceAiContextTabReference {
	const { context } = buildContext;

	return {
		title: tab.title,
		active: tab.id === context.activeTabId,
		view: getWorkspaceAiContextTabView(tab, buildContext),
	};
}

function getWorkspaceAiContextTabView(
	tab: WorkspaceTab,
	buildContext: WorkspaceAiContextSnapshotBuildContext,
): WorkspaceAiContextTabReference["view"] {
	const { context } = buildContext;

	if (!tab.viewItemId) {
		return { kind: "workspace-root" };
	}

	const item = context.itemsById.get(tab.viewItemId);

	if (!item) {
		return { kind: "missing-item" };
	}

	return {
		kind: "workspace-item",
		item: getWorkspaceAiContextItemReference({
			...buildContext,
			item,
		}),
	};
}

function getWorkspaceAiContextPresentationReference(
	presentation: WorkspacePresentation,
	buildContext: WorkspaceAiContextSnapshotBuildContext,
): WorkspaceAiContextPresentationReference {
	if (presentation.mode === "standard") {
		return {
			mode: "standard",
			activePane: getCurrentWorkspacePaneReference(buildContext),
		};
	}

	if (presentation.mode === "maximized") {
		return {
			mode: "maximized",
			activePane: getWorkspaceAiContextPaneReference(presentation.pane, buildContext),
			restoreMode: presentation.restorePresentation.mode,
		};
	}

	const panes = presentation.panes.map((pane) =>
		getWorkspaceAiContextPaneReference(pane, buildContext),
	);
	const activePaneIndex = presentation.panes.findIndex(
		(pane) => pane.id === presentation.activePaneId,
	);

	return {
		mode: "split",
		direction: presentation.direction,
		activePane: panes[activePaneIndex],
		panes,
	};
}

function getCurrentWorkspacePaneReference(
	buildContext: WorkspaceAiContextSnapshotBuildContext,
): WorkspaceAiContextPaneReference {
	const { context } = buildContext;

	if (!context.activeItem) {
		return { kind: "workspace-root" };
	}

	return {
		kind: "workspace-item",
		item: getWorkspaceAiContextItemReference({
			...buildContext,
			item: context.activeItem,
		}),
	};
}

function getWorkspaceAiContextPaneReference(
	pane: WorkspacePane,
	buildContext: WorkspaceAiContextSnapshotBuildContext,
): WorkspaceAiContextPaneReference {
	const { context } = buildContext;

	if (pane.kind === "root") {
		return { kind: "workspace-root" };
	}

	const item = context.itemsById.get(pane.itemId);

	if (!item) {
		return { kind: "missing-item" };
	}

	return {
		kind: "workspace-item",
		item: getWorkspaceAiContextItemReference({
			...buildContext,
			item,
		}),
	};
}
