import { type Editor, useEditorState } from "@tiptap/react";

export type DocumentFontSize = "16" | "18" | "24" | "32";
export type DocumentTextAlign = "center" | "justify" | "left" | "right";
export type DocumentStructureBlock =
	| "blockMath"
	| "bulletList"
	| "codeBlock"
	| "orderedList"
	| "table"
	| "taskList";
export type DocumentInlineMark =
	| "bold"
	| "highlight"
	| "inlineMath"
	| "italic"
	| "link"
	| "underline"
	| "strike"
	| "code";

export interface DocumentEditorCounts {
	selectedCharacters: number;
	selectedWords: number;
	totalCharacters: number;
	totalWords: number;
}

export interface DocumentEditorUiState {
	block:
		| { kind: "fontSize"; size: DocumentFontSize }
		| { kind: "structure"; type: DocumentStructureBlock };
	canRedo: boolean;
	canUndo: boolean;
	counts: DocumentEditorCounts;
	inlineMarks: Record<DocumentInlineMark, boolean>;
	textAlign: DocumentTextAlign;
}

const emptyDocumentEditorUiState: DocumentEditorUiState = {
	block: { kind: "fontSize", size: "16" },
	canRedo: false,
	canUndo: false,
	counts: {
		selectedCharacters: 0,
		selectedWords: 0,
		totalCharacters: 0,
		totalWords: 0,
	},
	inlineMarks: {
		bold: false,
		code: false,
		highlight: false,
		inlineMath: false,
		italic: false,
		link: false,
		strike: false,
		underline: false,
	},
	textAlign: "left",
};

export function useDocumentEditorUiState(editor: Editor | null) {
	return (
		useEditorState({
			editor,
			selector: ({ editor: currentEditor }) =>
				currentEditor ? getDocumentEditorUiState(currentEditor) : emptyDocumentEditorUiState,
		}) ?? emptyDocumentEditorUiState
	);
}

export function getActiveInlineFormat(
	inlineMarks: DocumentEditorUiState["inlineMarks"],
): DocumentInlineMark | null {
	if (inlineMarks.bold) {
		return "bold";
	}

	if (inlineMarks.italic) {
		return "italic";
	}

	if (inlineMarks.underline) {
		return "underline";
	}

	if (inlineMarks.strike) {
		return "strike";
	}

	if (inlineMarks.code) {
		return "code";
	}

	if (inlineMarks.highlight) {
		return "highlight";
	}

	if (inlineMarks.link) {
		return "link";
	}

	if (inlineMarks.inlineMath) {
		return "inlineMath";
	}

	return null;
}

function getDocumentEditorUiState(editor: Editor): DocumentEditorUiState {
	return {
		block: getActiveBlock(editor),
		canRedo: editor.can().redo(),
		canUndo: editor.can().undo(),
		counts: getEditorCounts(editor),
		inlineMarks: {
			bold: editor.isActive("bold"),
			code: editor.isActive("code"),
			highlight: editor.isActive("highlight"),
			inlineMath: editor.isActive("inlineMath"),
			italic: editor.isActive("italic"),
			link: editor.isActive("link"),
			strike: editor.isActive("strike"),
			underline: editor.isActive("underline"),
		},
		textAlign: getActiveTextAlign(editor),
	};
}

function getActiveTextAlign(editor: Editor): DocumentTextAlign {
	const headingAlign = editor.getAttributes("heading").textAlign;
	const paragraphAlign = editor.getAttributes("paragraph").textAlign;
	const textAlign = typeof headingAlign === "string" ? headingAlign : paragraphAlign;

	if (textAlign === "center" || textAlign === "justify" || textAlign === "right") {
		return textAlign;
	}

	return "left";
}

function getActiveBlock(editor: Editor): DocumentEditorUiState["block"] {
	if (editor.isActive("blockMath")) {
		return { kind: "structure", type: "blockMath" };
	}

	if (editor.isActive("codeBlock")) {
		return { kind: "structure", type: "codeBlock" };
	}

	if (editor.isActive("table")) {
		return { kind: "structure", type: "table" };
	}

	if (editor.isActive("bulletList")) {
		return { kind: "structure", type: "bulletList" };
	}

	if (editor.isActive("orderedList")) {
		return { kind: "structure", type: "orderedList" };
	}

	if (editor.isActive("taskList")) {
		return { kind: "structure", type: "taskList" };
	}

	if (editor.isActive("heading", { level: 1 })) {
		return { kind: "fontSize", size: "32" };
	}

	if (editor.isActive("heading", { level: 2 })) {
		return { kind: "fontSize", size: "24" };
	}

	if (editor.isActive("heading", { level: 3 })) {
		return { kind: "fontSize", size: "18" };
	}

	return { kind: "fontSize", size: "16" };
}

function getEditorCounts(editor: Editor): DocumentEditorCounts {
	const { from, to } = editor.state.selection;
	const selectedText = from === to ? "" : editor.state.doc.textBetween(from, to, " ");

	return {
		selectedCharacters: selectedText.length,
		selectedWords: countWords(selectedText),
		totalCharacters: editor.storage.characterCount.characters(),
		totalWords: editor.storage.characterCount.words(),
	};
}

function countWords(text: string) {
	return text.trim() ? text.trim().split(/\s+/).length : 0;
}
