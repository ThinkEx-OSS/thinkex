/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createWorkspaceKernelAiItems } from "#/features/workspaces/ai/workspace-kernel-ai-create";
import { editWorkspaceKernelAiItem } from "#/features/workspaces/ai/workspace-kernel-ai-edit";
import { readWorkspaceKernelAiItems } from "#/features/workspaces/ai/workspace-kernel-ai-read";
import { WORKSPACE_DOCUMENT_PREVIEW_TEXT_METADATA_KEY } from "#/features/workspaces/documents/document-preview-text";
import { getWorkspaceKernelFromEnv } from "#/features/workspaces/kernel/workspace-kernel-access";
import { workspaceItemLinksMetadataKey } from "#/features/workspaces/model/workspace-item-links";

const userId = "test-user";
const workspaceId = "test-workspace";

describe("workspace kernel AI item links", () => {
	beforeEach(async () => {
		await reset();
		await seedWorkspaceAccess();
	});

	it("persists create links, preserves other metadata, and returns links when reading", async () => {
		const created = await createWorkspaceKernelAiItems({
			userId,
			workspaceId,
			items: [
				{
					type: "document",
					path: "/Research Notes",
					initialContent: "# Research Notes\nShared source material.",
				},
				{
					type: "document",
					path: "/Synthesis",
					initialContent: "# Synthesis\nDerived interpretation.",
					links: ["/Research Notes"],
				},
			],
		});

		expect(created.failed).toEqual([]);
		expect(created.items.map((item) => item.path)).toEqual(["/Research Notes", "/Synthesis"]);

		const kernel = await getWorkspaceKernelFromEnv(env, workspaceId);
		const page = await kernel.getPage();
		const source = page.items.find((item) => item.name === "Research Notes");
		const synthesis = page.items.find((item) => item.name === "Synthesis");

		expect(source).toBeDefined();
		expect(synthesis?.metadataJson[workspaceItemLinksMetadataKey]).toEqual([source?.id]);
		expect(synthesis?.metadataJson[WORKSPACE_DOCUMENT_PREVIEW_TEXT_METADATA_KEY]).toBe(
			"Synthesis\nDerived interpretation.",
		);

		const read = await readWorkspaceKernelAiItems({
			userId,
			workspaceId,
			paths: ["/Synthesis"],
		});

		expect(read.failed).toEqual([]);
		expect(read.items[0]).toMatchObject({
			path: "/Synthesis",
			links: [{ path: "/Research Notes", type: "document" }],
		});
	});

	it("applies edit link semantics for omitted, empty, and replacement arrays", async () => {
		await createWorkspaceKernelAiItems({
			userId,
			workspaceId,
			items: [
				{ type: "document", path: "/A", initialContent: "# A" },
				{ type: "document", path: "/B", initialContent: "# B" },
				{ type: "document", path: "/C", initialContent: "# C" },
				{ type: "document", path: "/Doc", initialContent: "# Doc", links: ["/A"] },
			],
		});

		const editedContentOnly = await editWorkspaceKernelAiItem({
			userId,
			workspaceId,
			path: "/Doc",
			edits: [{ type: "append", text: "\nStill related to A." }],
		});

		expect(editedContentOnly.failed).toEqual([]);
		await expectItemLinks("/Doc", [{ path: "/A", type: "document" }]);

		const cleared = await editWorkspaceKernelAiItem({
			userId,
			workspaceId,
			path: "/Doc",
			links: [],
		});

		expect(cleared).toMatchObject({
			applied: 0,
			failed: [],
			links: [],
		});
		await expectItemLinks("/Doc", []);

		const replaced = await editWorkspaceKernelAiItem({
			userId,
			workspaceId,
			path: "/Doc",
			links: ["/B", "/C"],
		});

		expect(replaced.failed).toEqual([]);
		await expectItemLinks("/Doc", [
			{ path: "/B", type: "document" },
			{ path: "/C", type: "document" },
		]);

		const kernel = await getWorkspaceKernelFromEnv(env, workspaceId);
		const page = await kernel.getPage();
		const doc = page.items.find((item) => item.name === "Doc");

		expect(doc?.metadataJson[WORKSPACE_DOCUMENT_PREVIEW_TEXT_METADATA_KEY]).toBe("Doc");
	});

	it("drops self links from edit link updates", async () => {
		await createWorkspaceKernelAiItems({
			userId,
			workspaceId,
			items: [
				{ type: "document", path: "/A", initialContent: "# A" },
				{ type: "document", path: "/Doc", initialContent: "# Doc" },
			],
		});

		const edited = await editWorkspaceKernelAiItem({
			userId,
			workspaceId,
			path: "/Doc",
			links: ["/Doc", "/A"],
		});

		expect(edited.failed).toEqual([]);
		await expectItemLinks("/Doc", [{ path: "/A", type: "document" }]);
	});

	it("does not mutate links when document edits fail", async () => {
		await createWorkspaceKernelAiItems({
			userId,
			workspaceId,
			items: [
				{ type: "document", path: "/A", initialContent: "# A" },
				{ type: "document", path: "/B", initialContent: "# B" },
				{ type: "document", path: "/Doc", initialContent: "# Doc", links: ["/A"] },
			],
		});

		const edited = await editWorkspaceKernelAiItem({
			userId,
			workspaceId,
			path: "/Doc",
			edits: [{ type: "replace", oldText: "", newText: "replacement" }],
			links: ["/B"],
		});

		expect(edited).toMatchObject({
			applied: 0,
			failed: [{ code: "empty_old_text", index: 0 }],
		});
		await expectItemLinks("/Doc", [{ path: "/A", type: "document" }]);

		const kernel = await getWorkspaceKernelFromEnv(env, workspaceId);
		const page = await kernel.getPage();
		const doc = page.items.find((item) => item.name === "Doc");

		expect(doc?.metadataJson[WORKSPACE_DOCUMENT_PREVIEW_TEXT_METADATA_KEY]).toBe("Doc");
	});

	it("fails create and edit clearly when a link target cannot be resolved", async () => {
		const created = await createWorkspaceKernelAiItems({
			userId,
			workspaceId,
			items: [
				{
					type: "document",
					path: "/Broken",
					initialContent: "# Broken",
					links: ["/Missing"],
				},
			],
		});

		expect(created.items).toEqual([]);
		expect(created.failed).toEqual([
			{
				code: "link_path_not_found",
				index: 0,
				path: "/Missing",
			},
		]);

		await createWorkspaceKernelAiItems({
			userId,
			workspaceId,
			items: [
				{ type: "document", path: "/A", initialContent: "# A" },
				{ type: "document", path: "/Doc", initialContent: "# Doc", links: ["/A"] },
			],
		});

		const edited = await editWorkspaceKernelAiItem({
			userId,
			workspaceId,
			path: "/Doc",
			links: ["/Missing"],
		});

		expect(edited.failed).toEqual([
			{
				code: "link_path_not_found",
				index: 0,
				path: "/Missing",
			},
		]);
		await expectItemLinks("/Doc", [{ path: "/A", type: "document" }]);
	});

	it("fails create and edit clearly when a link path is not absolute", async () => {
		const created = await createWorkspaceKernelAiItems({
			userId,
			workspaceId,
			items: [
				{
					type: "document",
					path: "/Broken",
					initialContent: "# Broken",
					links: ["Missing"],
				},
			],
		});

		expect(created.items).toEqual([]);
		expect(created.failed).toEqual([
			{
				code: "link_path_not_absolute",
				index: 0,
				path: "Missing",
			},
		]);

		await createWorkspaceKernelAiItems({
			userId,
			workspaceId,
			items: [
				{ type: "document", path: "/A", initialContent: "# A" },
				{ type: "document", path: "/Doc", initialContent: "# Doc", links: ["/A"] },
			],
		});

		const edited = await editWorkspaceKernelAiItem({
			userId,
			workspaceId,
			path: "/Doc",
			links: ["Missing"],
		});

		expect(edited.failed).toEqual([
			{
				code: "link_path_not_absolute",
				index: 0,
				path: "Missing",
			},
		]);
		await expectItemLinks("/Doc", [{ path: "/A", type: "document" }]);
	});

	it("fails create and edit clearly when a link path is the workspace root", async () => {
		const created = await createWorkspaceKernelAiItems({
			userId,
			workspaceId,
			items: [
				{
					type: "document",
					path: "/Broken",
					initialContent: "# Broken",
					links: ["/"],
				},
			],
		});

		expect(created.items).toEqual([]);
		expect(created.failed).toEqual([
			{
				code: "link_path_is_root",
				index: 0,
				path: "/",
			},
		]);

		await createWorkspaceKernelAiItems({
			userId,
			workspaceId,
			items: [
				{ type: "document", path: "/A", initialContent: "# A" },
				{ type: "document", path: "/Doc", initialContent: "# Doc", links: ["/A"] },
			],
		});

		const edited = await editWorkspaceKernelAiItem({
			userId,
			workspaceId,
			path: "/Doc",
			links: ["/"],
		});

		expect(edited.failed).toEqual([
			{
				code: "link_path_is_root",
				index: 0,
				path: "/",
			},
		]);
		await expectItemLinks("/Doc", [{ path: "/A", type: "document" }]);
	});
});

async function expectItemLinks(
	path: string,
	links: Array<{ path: string; type: "document" | "file" | "flashcard" | "folder" | "quiz" }>,
) {
	const read = await readWorkspaceKernelAiItems({
		userId,
		workspaceId,
		paths: [path],
	});

	expect(read.failed).toEqual([]);
	expect(read.items[0]?.links).toEqual(links);
}

async function seedWorkspaceAccess() {
	await applyWorkspaceAccessSchema();
	const now = Date.now();

	await env.DB.prepare(
		`
			INSERT INTO user (
				id,
				name,
				email,
				email_verified,
				is_anonymous,
				created_at,
				updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`,
	)
		.bind(userId, "Test User", "test@example.com", 1, 0, now, now)
		.run();

	await env.DB.prepare(
		`
			INSERT INTO workspaces (
				id,
				name,
				owner_id,
				created_at,
				updated_at,
				archived_at
			) VALUES (?, ?, ?, ?, ?, ?)
		`,
	)
		.bind(workspaceId, "Test Workspace", userId, now, now, null)
		.run();

	await env.DB.prepare(
		`
			INSERT INTO workspace_members (
				id,
				workspace_id,
				user_id,
				role,
				created_at,
				updated_at
			) VALUES (?, ?, ?, ?, ?, ?)
		`,
	)
		.bind("test-membership", workspaceId, userId, "owner", now, now)
		.run();
}

async function applyWorkspaceAccessSchema() {
	for (const statement of workspaceAccessSchema) {
		await env.DB.exec(statement);
	}
}

const workspaceAccessSchema = [
	"CREATE TABLE user (id text PRIMARY KEY NOT NULL, name text NOT NULL, email text NOT NULL, email_verified integer DEFAULT false NOT NULL, image text, is_anonymous integer DEFAULT false, created_at integer NOT NULL, updated_at integer NOT NULL);",
	"CREATE TABLE workspaces (id text PRIMARY KEY NOT NULL, name text NOT NULL, icon text, color text, description text, owner_id text NOT NULL, created_at integer NOT NULL, updated_at integer NOT NULL, archived_at integer);",
	"CREATE TABLE workspace_members (id text PRIMARY KEY NOT NULL, workspace_id text NOT NULL, user_id text NOT NULL, role text DEFAULT 'viewer' NOT NULL, last_opened_at integer, created_at integer NOT NULL, updated_at integer NOT NULL);",
] as const;
