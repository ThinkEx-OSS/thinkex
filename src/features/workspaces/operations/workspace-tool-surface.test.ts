import { describe, expect, it } from "vitest";
import { z } from "zod";

import { getAIThreadSoulPrompt } from "#/features/workspaces/ai/ai-thread-soul-prompt";
import {
	workspaceCreateItemsInputSchema,
	workspaceDeleteItemsInputSchema,
	workspaceEditItemInputSchema,
	workspaceLinkItemsInputSchema,
	workspaceListItemsInputSchema,
	workspaceMoveItemsInputSchema,
	workspaceReadItemsInputSchema,
	workspaceRenameItemInputSchema,
} from "#/features/workspaces/operations/workspace-tool-schemas";

// Free, deterministic regression net for the model-facing surface: the assembled
// system prompt and each tool's input JSON schema (field `.describe()` text
// included). A change to a schema shape, a field description, or the soul prompt
// shows up here as a reviewable diff — zero model calls, runs in normal CI.
//
// Update intentionally with `pnpm test -u` when the change is deliberate; an
// unexpected diff is a regression to look at. Whether the model actually *uses*
// the surface correctly is the live evals' job: `pnpm eval`.

const TOOL_INPUT_SCHEMAS = {
	workspace_list_items: workspaceListItemsInputSchema,
	workspace_read_items: workspaceReadItemsInputSchema,
	workspace_create_items: workspaceCreateItemsInputSchema,
	workspace_edit_item: workspaceEditItemInputSchema,
	workspace_delete_items: workspaceDeleteItemsInputSchema,
	workspace_move_items: workspaceMoveItemsInputSchema,
	workspace_rename_item: workspaceRenameItemInputSchema,
	workspace_link_items: workspaceLinkItemsInputSchema,
} as const;

describe("workspace tool surface", () => {
	it("system prompt is stable", () => {
		expect(getAIThreadSoulPrompt()).toMatchSnapshot();
	});

	for (const [name, schema] of Object.entries(TOOL_INPUT_SCHEMAS)) {
		it(`${name} input schema is stable`, () => {
			expect(z.toJSONSchema(schema)).toMatchSnapshot();
		});
	}

	it("gives documents and flashcards the same edit verbs and ref protocol", () => {
		const documentRef = "b_x7Kp2Qa9x8Lm.r_4f2a1b";
		const otherDocumentRef = "b_y8Lq3Rb0y9Mn.r_9c3d2e";
		const flashcardRef = "c_9xKp2Qab.r_4f2a1b";
		const otherFlashcardRef = "c_8Lq3Rb0y.r_9c3d2e";
		const sharedVerbs = [
			"insert_before",
			"insert_after",
			"update",
			"replace",
			"replace_text",
			"move",
			"delete",
		];
		const documentEdits = [
			{ op: "insert_before", ref: documentRef, html: "<p>New</p>" },
			{ op: "insert_after", ref: documentRef, html: "<p>New</p>" },
			{ op: "update", ref: documentRef, html: "<p>New</p>" },
			{ op: "replace", ref: documentRef, html: "<p>New</p>" },
			{ op: "replace_text", ref: documentRef, find: "old", replace: "new" },
			{ op: "move", ref: documentRef, afterRef: otherDocumentRef },
			{ op: "delete", ref: documentRef },
		];
		const flashcardEdits = [
			{ op: "insert_before", ref: flashcardRef, front: "<p>Q</p>", back: "<p>A</p>" },
			{ op: "insert_after", ref: flashcardRef, front: "<p>Q</p>", back: "<p>A</p>" },
			{ op: "update", ref: flashcardRef, front: "<p>Q</p>" },
			{ op: "replace", ref: flashcardRef, front: "<p>Q</p>", back: "<p>A</p>" },
			{ op: "replace_text", ref: flashcardRef, side: "front", find: "Q", replace: "R" },
			{ op: "move", ref: flashcardRef, afterRef: otherFlashcardRef },
			{ op: "delete", ref: flashcardRef },
		];

		expect(documentEdits.map((edit) => edit.op)).toEqual(sharedVerbs);
		expect(flashcardEdits.map((edit) => edit.op)).toEqual(sharedVerbs);
		for (const [type, edits] of [
			["document", documentEdits],
			["flashcard", flashcardEdits],
		] as const) {
			expect(
				workspaceEditItemInputSchema.safeParse({ type, path: "/Biology", edits }).success,
			).toBe(true);
		}
		expect(
			workspaceEditItemInputSchema.safeParse({
				type: "document",
				path: "/Biology",
				edits: [{ op: "overwrite", html: "<p>Old API</p>" }],
			}).success,
		).toBe(false);
	});
});
