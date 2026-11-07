import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { createQuizSetFromInputs, stringifyQuizSetContent } from "./quiz-content";
import {
	readQuizViewer,
	recordQuizShortAnswer,
	resetQuizStudyProgress,
} from "./quiz-study-persistence";

// Run against a migrated, disposable PostgreSQL database. Each suite owns its fixtures.
const connectionString = process.env.THINKEX_QUIZ_TEST_DATABASE_URL;
const { grade } = vi.hoisted(() => ({ grade: vi.fn() }));
vi.mock("cloudflare:workers", () => ({
	env: { HYPERDRIVE: { connectionString: process.env.THINKEX_QUIZ_TEST_DATABASE_URL } },
}));
vi.mock("#/features/workspaces/quizzes/quiz-grading", () => ({ gradeQuizResponse: grade }));
vi.mock("#/lib/auth-queries.server", () => ({ getSessionFromHeaders: vi.fn() }));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeaders: vi.fn() }));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe.skipIf(!connectionString)("short-answer submissions in PostgreSQL", () => {
	const db = new Client({ connectionString });
	const userId = randomUUID();
	const workspaceId = randomUUID();
	const itemId = randomUUID();
	const set = createQuizSetFromInputs([
		{
			kind: "short_answer",
			question: "<p>What drives diffusion?</p>",
			modelAnswer: "<p>A concentration gradient.</p>",
			gradingCriteria: "Identify the gradient.",
			explanation: "<p>Net movement follows the concentration gradient.</p>",
		},
	]);
	const input = {
		itemId,
		workspaceId,
		userId,
		questionId: set.questions[0]!.id,
		textResponse: "A gradient.",
	};
	const result = { correct: true, feedback: "You identified the gradient." };

	beforeAll(async () => {
		await db.connect();
		await db.query('insert into "user" (id,name,email) values ($1,$1,$2)', [
			userId,
			userId + "@example.test",
		]);
		await db.query("insert into workspaces (id,name,owner_id) values ($1,'Quiz test',$2)", [
			workspaceId,
			userId,
		]);
		await db.query(
			"insert into workspace_members (id,workspace_id,user_id,role) values ($1,$2,$3,'owner')",
			[randomUUID(), workspaceId, userId],
		);
		await db.query(
			"insert into workspace_items (id,workspace_id,type,name,name_key,sort_order) values ($1,$2,'quiz','Quiz','quiz',1)",
			[itemId, workspaceId],
		);
		await db.query("insert into workspace_item_contents (item_id,content) values ($1,$2)", [
			itemId,
			stringifyQuizSetContent(set),
		]);
	});
	afterAll(async () => {
		try {
			await db.query("delete from workspaces where id=$1", [workspaceId]);
			await db.query('delete from "user" where id=$1', [userId]);
		} finally {
			await db.end();
		}
	});

	it("returns the first committed answer to both tabs and on reload", async () => {
		const started = deferred<void>();
		const finish = deferred<typeof result>();
		grade
			.mockImplementationOnce(() => {
				started.resolve();
				return finish.promise;
			})
			.mockResolvedValueOnce(result);
		const firstTab = recordQuizShortAnswer(input);
		await started.promise;
		let secondTab;
		try {
			secondTab = await recordQuizShortAnswer({ ...input, textResponse: "Second tab" });
		} finally {
			finish.resolve(result);
		}
		expect(await firstTab).toEqual(secondTab);
		const { studyState } = await readQuizViewer(input);
		expect(studyState.answers[input.questionId]).toMatchObject({
			...result,
			textResponse: "Second tab",
		});
	});

	it("keeps a reset made during grading", async () => {
		await resetQuizStudyProgress(input);
		const started = deferred<void>();
		const finish = deferred<typeof result>();
		grade.mockImplementationOnce(() => {
			started.resolve();
			return finish.promise;
		});
		const pending = recordQuizShortAnswer(input);
		await started.promise;
		try {
			await resetQuizStudyProgress(input);
		} finally {
			finish.resolve(result);
		}
		await expect(pending).rejects.toThrow("progress changed");
		expect((await readQuizViewer(input)).studyState.answers).toEqual({});
	});
});
