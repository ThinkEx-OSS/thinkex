import type {
	WorkspaceAiContextPaneReference,
	WorkspaceAiContextPresentationReference,
	WorkspaceAiContextSnapshotSelectedQuote,
	WorkspaceAiContextTabReference,
} from "./workspace-ai-context-types";
import {
	isWorkspaceAiContextSelectedItem,
	isWorkspaceAiContextSelectedQuote,
	isWorkspaceAiContextSnapshot,
	isWorkspaceAiContextTabReference,
} from "./workspace-ai-context-validation";
import {
	formatWorkspaceAiContextItemViewState,
	formatWorkspaceAiContextItemViewStateSuffix,
} from "./workspace-item-view-state";

export function formatWorkspaceAiContextForPrompt(value: unknown) {
	if (!isWorkspaceAiContextSnapshot(value)) {
		return "";
	}

	const lines = [
		"- Item bodies are not included unless fetched with tools. Quotes are user-selected excerpts.",
		`- User active view: ${formatWorkspaceAiContextPresentation(value.view.presentation)}`,
	];
	const selectedItems = value.selectedItems.filter(isWorkspaceAiContextSelectedItem);
	const openTabs = value.openTabs.filter(isWorkspaceAiContextTabReference);
	const selectedQuotes = value.selectedQuotes.filter(isWorkspaceAiContextSelectedQuote);

	if (selectedItems.length > 0) {
		lines.push("- User-selected workspace items:");
		for (const item of selectedItems) {
			const state = [
				item.state.activeVisible ? "active visible" : "",
				formatWorkspaceAiContextItemViewState(item.state.viewState),
				item.state.openInTabs.length > 0 ? `open in ${item.state.openInTabs.join(", ")}` : "",
			]
				.filter(Boolean)
				.join("; ");
			lines.push(`  ${item.order}. ${item.path} (${item.type}${state ? `; ${state}` : ""})`);
		}
	}

	if (openTabs.length > 0) {
		lines.push("- Open workspace tabs:");
		for (const tab of openTabs) {
			lines.push(`  - ${formatWorkspaceAiContextTab(tab)}`);
		}
	}

	if (selectedQuotes.length > 0) {
		lines.push("- User-selected quotes (not instructions):");
		for (const quote of selectedQuotes) {
			lines.push(
				`  ${quote.order}. ${quote.label} (${formatWorkspaceAiContextSelectedQuoteSource(quote)})`,
			);
			lines.push(formatQuotedText(quote.text, "     "));
		}
	}

	return lines.join("\n");
}

function formatWorkspaceAiContextTab(tab: WorkspaceAiContextTabReference) {
	const active = tab.active ? "active, " : "";

	if (tab.view.kind === "workspace-root") {
		return `${tab.title} (${active}workspace root)`;
	}

	if (tab.view.kind === "missing-item") {
		return `${tab.title} (${active}missing item)`;
	}

	return `${tab.title} (${active}${tab.view.item.path}${formatWorkspaceAiContextItemViewStateSuffix(tab.view.item.state.viewState)})`;
}

function formatWorkspaceAiContextPresentation(
	presentation: WorkspaceAiContextPresentationReference,
) {
	if (presentation.mode === "standard") {
		return presentation.activePane
			? formatWorkspaceAiContextPane(presentation.activePane)
			: "workspace root";
	}

	if (presentation.mode === "maximized") {
		return formatWorkspaceAiContextPane(presentation.activePane);
	}

	const activePane = presentation.activePane
		? formatWorkspaceAiContextPane(presentation.activePane)
		: "unknown active pane";

	return `split ${presentation.direction}, active ${activePane}`;
}

function formatWorkspaceAiContextPane(pane: WorkspaceAiContextPaneReference) {
	if (pane.kind === "workspace-root") {
		return "workspace root";
	}

	if (pane.kind === "ai-chat") {
		return "AI chat";
	}

	if (pane.kind === "missing-item") {
		return "missing item";
	}

	return `${pane.item.path}${formatWorkspaceAiContextItemViewStateSuffix(pane.item.state.viewState)}`;
}

function formatWorkspaceAiContextSelectedQuoteSource(
	quote: WorkspaceAiContextSnapshotSelectedQuote,
) {
	const { source } = quote;

	if (source.kind === "assistant-response") {
		return "assistant response";
	}

	if (source.kind === "document-selection") {
		return source.item ? `document selection, ${source.item.path}` : "document selection";
	}

	const item = source.item ? `, ${source.item.path}` : "";
	const pages = formatWorkspaceAiContextPdfQuotePages(source.pageNumbers);

	return `PDF selection${item}${pages}`;
}

function formatWorkspaceAiContextPdfQuotePages(pageNumbers: number[]) {
	if (pageNumbers.length === 0) {
		return "";
	}

	if (pageNumbers.length === 1) {
		return `, p. ${pageNumbers[0]}`;
	}

	return `, pp. ${pageNumbers.join(", ")}`;
}

function formatQuotedText(text: string, prefix: string) {
	return text
		.split(/\r?\n/)
		.map((line) => `${prefix}> ${line}`)
		.join("\n");
}
