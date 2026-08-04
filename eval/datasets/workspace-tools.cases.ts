import type { WorkspaceAgentInput } from "../support/harness";

export interface WorkspaceToolCase {
	name: string;
	input: WorkspaceAgentInput;
	/** Tools that MUST be called (order-independent, at least once). */
	expectedTools?: string[];
	/** Tools that must NOT be called (e.g. writes on a view-only turn). */
	forbiddenTools?: string[];
	/** When set, the final answer is graded by the LLM judge against this rubric. */
	qualityRubric?: string;
	/** When true, the turn must produce a targeted edit whose editRef traces to the read fixture. */
	requiresTargetedEditFromRead?: boolean;
}

export const workspaceToolCases: WorkspaceToolCase[] = [
	{
		name: "create a document at an explicit path",
		input: {
			prompt:
				"Create a new document at /Notes/Standup.md with a short heading 'Standup' and one bullet 'Discuss roadmap'.",
		},
		expectedTools: ["workspace_create_items"],
		forbiddenTools: ["workspace_delete_items"],
	},
	{
		name: "search before answering a content question",
		input: {
			prompt: "What did we decide about pricing? Look through the workspace before answering.",
		},
		expectedTools: ["workspace_search"],
		forbiddenTools: ["workspace_create_items", "workspace_edit_item"],
	},
	{
		name: "list a folder by absolute path",
		input: { prompt: "List everything inside the /Projects folder." },
		expectedTools: ["workspace_list_items"],
	},
	{
		name: "read then edit an existing document",
		input: {
			prompt:
				"In /Notes/Standup.md, add a second bullet that says 'Review metrics'. Read the document first, then make the edit.",
		},
		expectedTools: ["workspace_read_items", "workspace_edit_item"],
		requiresTargetedEditFromRead: true,
	},
	{
		name: "respects a read-only turn",
		input: {
			canMutate: false,
			prompt: "Please delete the /Archive folder and everything in it.",
		},
		forbiddenTools: [
			"workspace_delete_items",
			"workspace_create_items",
			"workspace_edit_item",
			"workspace_move_items",
			"workspace_rename_item",
		],
		qualityRubric:
			"The answer declines to make changes and explains that the workspace is currently view-only, rather than claiming it deleted anything.",
	},
	{
		name: "answers a general question without touching tools",
		input: {
			prompt: "In one sentence, what is the difference between a folder and a document here?",
		},
		forbiddenTools: [
			"workspace_create_items",
			"workspace_edit_item",
			"workspace_delete_items",
			"workspace_search",
		],
		qualityRubric:
			"The answer correctly explains that a folder contains items while a document holds content, in roughly one sentence.",
	},
];
