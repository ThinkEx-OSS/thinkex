/**
 * Runs the real search stack against a real Postgres: real content writers,
 * real SQL, real operation. Opt-in via `pnpm test:db` because CI has no
 * database; the mocked unit tests cannot see ranking, counting, or the
 * generated tsvector columns, which is where every bug here has been.
 */
import { sql } from "drizzle-orm";
import { beforeAll, expect, it, vi } from "vitest";

// The only module that reaches for cloudflare:workers. Swapped for a real
// Postgres-backed one so every layer beneath it runs unmocked.
const db = vi.hoisted(() => {
	const { drizzle } = require("drizzle-orm/node-postgres");
	const { Client } = require("pg");
	const client = new Client({
		connectionString: process.env.TEST_DB_URL ?? "postgresql://localhost:5432/thinkex_db_test",
	});
	const ready = client.connect();
	// No schema object: the code under test uses the core builder and raw SQL.
	const instance = drizzle(client);
	return {
		instance,
		ready,
		close: async () => client.end(),
	};
});

vi.mock("#/db/server", () => ({
	createDbContext: async () => {
		await db.ready;
		return { db: db.instance, dispose: async () => {} };
	},
	withDb: async (handler: (database: unknown) => Promise<unknown>) => {
		await db.ready;
		return handler(db.instance);
	},
}));
// Membership is the shared path every operation already uses; the real module
// needs a TanStack request in scope.
vi.mock("#/features/workspaces/server/permissions", () => ({
	assertCanReadWorkspace: vi.fn(),
	assertCanMutateWorkspace: vi.fn(),
	assertCanDeleteWorkspace: vi.fn(),
	assertCanGrantWorkspaceRole: vi.fn(),
	canReadWorkspace: vi.fn(async () => true),
	getCurrentUserId: vi.fn(async () => "user_db_test"),
	getWorkspaceMemberRole: vi.fn(async () => "owner"),
}));
// Realtime is out of scope, and the agents package pulls cloudflare:workers in.
vi.mock("#/features/workspaces/realtime/workspace-room-notifier", () => ({
	notifyWorkspaceRoom: vi.fn(),
	disconnectWorkspaceRoomMember: vi.fn(),
	requestWorkspaceItemCleanup: vi.fn(),
}));

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { searchWorkspaceItemsOperation } from "#/features/workspaces/operations/search-items";
import {
	createWorkspaceAccessContext,
	workspaceAccessScopes,
} from "#/features/workspaces/operations/workspace-access-context";
import { commitWorkspaceDocumentCheckpoint } from "#/features/workspaces/persistence/workspace-document-checkpoints";
import { createWorkspaceItem } from "#/features/workspaces/persistence/workspace-items";

const env = {} as Cloudflare.Env;
const WORKSPACE_ID = "ws_db_test";
const USER_ID = "user_db_test";

/** The substantive page, plus filler that only mentions the term in passing. */
const LECTURE_PAGES: Array<[number, string]> = [
	[
		12,
		"Prophase: the chromatin condenses and the nuclear envelope breaks down. This is the first stage of mitosis.",
	],
	[14, "Spindle fibres attach at the kinetochore during metaphase."],
	[40, "Appendix: laboratory safety, goggles, and eyewash stations."],
	[41, "Mitosis appears again here in passing."],
	[42, "Mitosis again on this page too."],
	[43, "And mitosis once more, a fifth mention."],
];

function paragraph(text: string) {
	return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

async function search(patterns: string[]) {
	return await searchWorkspaceItemsOperation(
		createWorkspaceAccessContext({
			operationId: "op_db_test",
			scopes: workspaceAccessScopes,
			userId: USER_ID,
			workspaceId: WORKSPACE_ID,
		}),
		{ patterns },
	);
}

beforeAll(async () => {
	await db.ready;
	await migrate(db.instance, { migrationsFolder: "./drizzle-postgres" });
	for (const statement of [
		sql`delete from workspaces where id = ${WORKSPACE_ID}`,
		sql`delete from "user" where id = ${USER_ID}`,
		sql`insert into "user" (id, name, email) values (${USER_ID}, 'DB test', 'db-test@example.com')`,
		sql`insert into workspaces (id, name, owner_id) values (${WORKSPACE_ID}, 'Bio 101', ${USER_ID})`,
		sql`insert into workspace_members (id, workspace_id, user_id, role) values ('m_db_test', ${WORKSPACE_ID}, ${USER_ID}, 'owner')`,
	]) {
		await db.instance.execute(statement);
	}

	await createWorkspaceItem(env, {
		id: "item_doc",
		workspaceId: WORKSPACE_ID,
		name: "Week 3 notes",
		type: "document",
		actorUserId: USER_ID,
	});
	await commitWorkspaceDocumentCheckpoint(env, {
		actorUserId: USER_ID,
		itemId: "item_doc",
		workspaceId: WORKSPACE_ID,
		content: JSON.stringify(
			paragraph("I still do not get how mitosis differs from meiosis. Ask in office hours."),
		),
	});
	await createWorkspaceItem(env, {
		id: "item_cards",
		workspaceId: WORKSPACE_ID,
		name: "Cell division cards",
		type: "flashcard",
		actorUserId: USER_ID,
		initialContent: JSON.stringify({
			version: 1,
			cards: [
				{
					id: "c_aaaaaaaa",
					front: paragraph("What happens in prophase?"),
					back: paragraph("Chromatin condenses and the envelope breaks down."),
				},
			],
		}),
	});

	// Two files, as upload plus extraction leave them.
	await db.instance.execute(sql`
		insert into workspace_items (id, workspace_id, type, name, name_key, ref_key, sort_order)
			values ('item_pdf', ${WORKSPACE_ID}, 'file', 'Lecture 3.pdf', 'lecture 3.pdf', 'aB3xK9pQ', 100)`);
	await db.instance.execute(sql`
		insert into workspace_items (id, workspace_id, type, name, name_key, ref_key, sort_order)
			values ('item_pending', ${WORKSPACE_ID}, 'file', 'Textbook ch7.pdf', 'textbook ch7.pdf', 'zZ9yL0rS', 200)`);
	await db.instance.execute(sql`
		insert into workspace_item_extractions (workspace_id, item_id, status)
			values (${WORKSPACE_ID}, 'item_pending', 'processing')`);
	for (const [page, markdown] of LECTURE_PAGES) {
		await db.instance.execute(sql`
			insert into workspace_item_pages (item_id, page_number, markdown, markdown_bytes)
				values ('item_pdf', ${page}, ${markdown}, ${markdown.length})`);
	}
}, 120_000);

it("projects real writes into search_text", async () => {
	// The hoisted client is built through require(), so its rows arrive untyped.
	const { rows } = (await db.instance.execute(
		sql`select item_id, search_text from workspace_item_contents order by item_id`,
	)) as { rows: Array<{ item_id: string; search_text: string }> };
	expect(Object.fromEntries(rows.map((row) => [row.item_id, row.search_text]))).toEqual({
		item_cards: "What happens in prophase?\nChromatin condenses and the envelope breaks down.",
		item_doc: "I still do not get how mitosis differs from meiosis. Ask in office hours.",
	});
});

it("addresses a file page hit so it reads back directly", async () => {
	const { hits } = await search(["mitosis"]);
	expect(hits).toContainEqual(
		expect.objectContaining({ ref: "aB3xK9pQ/p12", page: 12, path: "/Lecture 3.pdf" }),
	);
});

// Length normalization used to rank passing mentions above the page that
// explains the term, and the per-item cap then dropped the good page entirely.
it("ranks the substantive page above passing mentions", async () => {
	const { hits } = await search(["mitosis"]);
	const pages = hits.filter((hit) => hit.page).map((hit) => hit.page);
	expect(pages[0]).toBe(12);
});

it("counts only the matches it returns", async () => {
	const result = await search(["mitosis"]);
	const contentHits = result.hits.filter((hit) => hit.match === "content");
	expect(result.matches).toBe(contentHits.length);
});

// rankNameSearch treats spaces as AND-tokens, so a joined query matched nothing.
it("matches a name on any one of several patterns", async () => {
	const { hits } = await search(["mitosis", "cell division"]);
	expect(hits).toContainEqual(
		expect.objectContaining({ match: "name", path: "/Cell division cards" }),
	);
});

it("stems, so a query word need not be the written word", async () => {
	const { hits } = await search(["condense"]);
	expect(hits.map((hit) => hit.path)).toContain("/Cell division cards");
});

it("supports quoted phrases", async () => {
	const { hits } = await search(['"office hours"']);
	expect(hits).toHaveLength(1);
	expect(hits[0]?.snippet).toContain("**office** **hours**");
});

it("returns nothing rather than a weak tail", async () => {
	expect(await search(["photosynthesis"])).toMatchObject({ matches: 0, hits: [] });
});

// Word-based search, so regex syntax finds nothing. Worth pinning: the tool
// description promises this, and a silent zero would read as "no such content".
it("finds nothing for regex syntax", async () => {
	expect((await search(["mitosis.*meiosis"])).hits).toEqual([]);
});

it("names files whose text is not indexed yet", async () => {
	expect((await search(["mitosis"])).unsearchable).toEqual([
		{ path: "/Textbook ch7.pdf", reason: "extracting" },
	]);
});
