import type { WorkspaceItemType } from "#/features/workspaces/contracts";
import {
	extractDocumentPlainText,
	extractTiptapPlainText,
} from "#/features/workspaces/documents/document-preview-text";
import { parseFlashcardSetContent } from "#/features/workspaces/flashcards/flashcard-content";
import { parseQuizSetContent } from "#/features/workspaces/quizzes/quiz-content";
import { getWorkspaceRecordingTranscriptText } from "#/features/workspaces/recordings/workspace-recording-transcript";

/**
 * The prose projection stored in `workspace_item_contents.search_text`.
 *
 * Every writer of `content` writes this alongside it, so the search index
 * never sees an item's storage format. Files are absent here on purpose:
 * extraction already stores their prose per page.
 */
export function buildWorkspaceItemSearchText(type: WorkspaceItemType, content: string): string {
	switch (type) {
		case "document":
			return extractDocumentPlainText(content);
		case "flashcard":
			return joinSearchTextLines(
				parseFlashcardSetContent(content).cards.flatMap((card) => [
					extractTiptapPlainText(card.front),
					extractTiptapPlainText(card.back),
				]),
			);
		case "quiz":
			return joinSearchTextLines(
				parseQuizSetContent(content).questions.flatMap((question) => [
					extractTiptapPlainText(question.question),
					...question.options.map((option) => extractTiptapPlainText(option.text)),
					extractTiptapPlainText(question.explanation),
				]),
			);
		case "recording":
			return getWorkspaceRecordingTranscriptText(content);
		case "file":
		case "folder":
			return "";
	}
}

/**
 * The column values every writer of item content must set together, so adding
 * a writer cannot leave an item silently unsearchable.
 */
export function workspaceItemContentValues(type: WorkspaceItemType, content: string) {
	return { content, searchText: buildWorkspaceItemSearchText(type, content) };
}

// extractTiptapPlainText already trims; an entry with an empty side still
// yields "", so the filter stays.
function joinSearchTextLines(lines: string[]) {
	return lines.filter((line) => line.length > 0).join("\n");
}
