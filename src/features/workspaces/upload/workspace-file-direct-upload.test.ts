import { afterEach, describe, expect, it, vi } from "vitest";

import {
	claimWorkspaceDirectUploadCompletion,
	createWorkspaceDirectUploadSession,
	verifyWorkspaceDirectUploadToken,
} from "#/features/workspaces/upload/workspace-file-direct-upload";

const sign = vi.hoisted(() => vi.fn());

vi.mock("aws4fetch", () => ({
	AwsClient: class {
		sign = sign;
	},
}));

describe("workspace direct upload sessions", () => {
	afterEach(() => {
		vi.useRealTimers();
		sign.mockReset();
	});

	it("binds a presigned R2 PUT to signed completion claims", async () => {
		sign.mockImplementation(async (request: Request) => request);
		const env = createEnv();
		const session = await createWorkspaceDirectUploadSession(env, {
			clientMutationId: "mutation-1",
			contentType: "application/pdf",
			fileName: "report.pdf",
			fileSize: 42,
			parentId: null,
			userId: "user-1",
			workspaceId: "workspace-1",
		});
		const signedRequest = sign.mock.calls[0]?.[0] as Request;

		expect(signedRequest.method).toBe("PUT");
		expect(signedRequest.headers.get("content-type")).toBe("application/pdf");
		expect(signedRequest.url).toContain(
			"/thinkex-workspace-kernel-files/workspace_file_uploads/workspace-1/",
		);

		await expect(
			verifyWorkspaceDirectUploadToken(env, session.completionToken),
		).resolves.toMatchObject({
			clientMutationId: "mutation-1",
			fileName: "report.pdf",
			fileSize: 42,
			userId: "user-1",
			workspaceId: "workspace-1",
		});
	});

	it("rejects tampered and expired completion tokens", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-14T12:00:00Z"));
		sign.mockImplementation(async (request: Request) => request);
		const env = createEnv();
		const session = await createWorkspaceDirectUploadSession(env, {
			clientMutationId: "mutation-1",
			contentType: "image/png",
			fileName: "image.png",
			fileSize: 10,
			parentId: null,
			userId: "user-1",
			workspaceId: "workspace-1",
		});
		const lastCharacter = session.completionToken.at(-1);
		const tampered = `${session.completionToken.slice(0, -1)}${lastCharacter === "x" ? "y" : "x"}`;

		await expect(verifyWorkspaceDirectUploadToken(env, tampered)).rejects.toThrow("invalid");

		vi.setSystemTime(new Date("2026-07-14T12:31:00Z"));
		await expect(verifyWorkspaceDirectUploadToken(env, session.completionToken)).rejects.toThrow(
			"expired",
		);
	});

	it("allows only one upload completion owner", async () => {
		const values = new Set<string>();
		const env = {
			...createEnv(),
			WORKSPACE_KERNEL_FILES: {
				async put(key: string) {
					if (values.has(key)) {
						return null;
					}
					values.add(key);
					return { key };
				},
			} as unknown as R2Bucket,
		};
		const claims = {
			clientMutationId: "mutation-1",
			contentType: "application/pdf",
			expiresAt: Math.floor(Date.now() / 1_000) + 60,
			fileName: "report.pdf",
			fileSize: 42,
			itemId: crypto.randomUUID(),
			parentId: null,
			userId: "user-1",
			version: 1 as const,
			workspaceId: "workspace-1",
		};

		const [first, second] = await Promise.all([
			claimWorkspaceDirectUploadCompletion(env, claims),
			claimWorkspaceDirectUploadCompletion(env, claims),
		]);

		expect(first).toContain("/completion");
		expect(second).toBeNull();
	});
});

function createEnv() {
	return {
		R2_ACCESS_KEY_ID: "access-key",
		R2_ACCOUNT_ID: "account-id",
		R2_BUCKET_NAME: "thinkex-workspace-kernel-files",
		R2_SECRET_ACCESS_KEY: "secret-key",
	} as Cloudflare.Env;
}
