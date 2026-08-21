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
			contentType: "application/pdf",
			fileName: "report.pdf",
			fileSize: 42,
			ownerItemId: null,
			parentId: null,
			target: "source",
			userId: "user-1",
			workspaceId: "workspace-1",
		});
		const signedRequest = sign.mock.calls[0]?.[0] as Request;

		expect(signedRequest.method).toBe("PUT");
		expect(signedRequest.headers.get("content-type")).toBe("application/pdf");
		expect(signedRequest.url).toContain(
			"/thinkex-workspace-kernel-files/workspace_file_objects/workspace-1/",
		);

		await expect(
			verifyWorkspaceDirectUploadToken(env, session.completionToken),
		).resolves.toMatchObject({
			fileName: "report.pdf",
			fileSize: 42,
			target: "source",
			userId: "user-1",
			workspaceId: "workspace-1",
		});
	});

	it("keeps conversion inputs under the temporary upload prefix", async () => {
		sign.mockImplementation(async (request: Request) => request);
		const session = await createWorkspaceDirectUploadSession(createEnv(), {
			contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			fileName: "report.docx",
			fileSize: 42,
			ownerItemId: null,
			parentId: null,
			target: "staging",
			userId: "user-1",
			workspaceId: "workspace-1",
		});
		const signedRequest = sign.mock.calls[0]?.[0] as Request;

		expect(signedRequest.url).toContain(
			"/thinkex-workspace-kernel-files/workspace_file_uploads/workspace-1/",
		);
		await expect(
			verifyWorkspaceDirectUploadToken(createEnv(), session.completionToken),
		).resolves.toMatchObject({ fileName: "report.docx", target: "staging" });
	});

	it("rejects token operations when the upload token secret is missing", async () => {
		sign.mockImplementation(async (request: Request) => request);
		const env = createEnv();
		const session = await createWorkspaceDirectUploadSession(env, {
			contentType: "application/pdf",
			fileName: "report.pdf",
			fileSize: 42,
			ownerItemId: null,
			parentId: null,
			target: "source",
			userId: "user-1",
			workspaceId: "workspace-1",
		});
		delete (env as Partial<Cloudflare.Env>).WORKSPACE_UPLOAD_TOKEN_SECRET;

		await expect(verifyWorkspaceDirectUploadToken(env, session.completionToken)).rejects.toThrow(
			"WORKSPACE_UPLOAD_TOKEN_SECRET is required",
		);
		await expect(
			createWorkspaceDirectUploadSession(env, {
				contentType: "application/pdf",
				fileName: "report.pdf",
				fileSize: 42,
				ownerItemId: null,
				parentId: null,
				target: "source",
				userId: "user-1",
				workspaceId: "workspace-1",
			}),
		).rejects.toThrow("WORKSPACE_UPLOAD_TOKEN_SECRET is required");
	});

	it("rejects tampered and expired completion tokens", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-14T12:00:00Z"));
		sign.mockImplementation(async (request: Request) => request);
		const env = createEnv();
		const session = await createWorkspaceDirectUploadSession(env, {
			contentType: "image/png",
			fileName: "image.png",
			fileSize: 10,
			ownerItemId: null,
			parentId: null,
			target: "source",
			userId: "user-1",
			workspaceId: "workspace-1",
		});
		const [payload, signature] = session.completionToken.split(".") as [string, string];
		const tamperedPayload = `${payload.startsWith("x") ? "y" : "x"}${payload.slice(1)}`;
		const tampered = `${tamperedPayload}.${signature}`;

		await expect(verifyWorkspaceDirectUploadToken(env, tampered)).rejects.toThrow("invalid");

		vi.setSystemTime(new Date("2026-07-14T12:31:00Z"));
		await expect(verifyWorkspaceDirectUploadToken(env, session.completionToken)).rejects.toThrow(
			"expired",
		);
	});

	it("allows only one completion owner for an upload", async () => {
		let claimed = false;
		const env = {
			...createEnv(),
			WORKSPACE_FILES: {
				async put() {
					if (claimed) {
						return null;
					}
					claimed = true;
					return {} as R2Object;
				},
			} as unknown as R2Bucket,
		} as Cloudflare.Env;
		const claims = {
			contentType: "application/pdf",
			expiresAt: Math.floor(Date.now() / 1_000) + 60,
			fileName: "report.pdf",
			fileSize: 42,
			itemId: "049b4e8b-d223-4654-bf7a-20f750721c3d",
			ownerItemId: null,
			parentId: null,
			target: "source" as const,
			userId: "user-1",
			version: 3 as const,
			workspaceId: "workspace-1",
		};

		await expect(claimWorkspaceDirectUploadCompletion(env, claims)).resolves.toContain(
			"workspace_file_uploads/workspace-1/",
		);
		await expect(claimWorkspaceDirectUploadCompletion(env, claims)).resolves.toBeNull();
	});
});

function createEnv() {
	return {
		R2_ACCESS_KEY_ID: "access-key",
		R2_ACCOUNT_ID: "account-id",
		R2_BUCKET_NAME: "thinkex-workspace-kernel-files",
		R2_SECRET_ACCESS_KEY: "secret-key",
		WORKSPACE_UPLOAD_TOKEN_SECRET: "upload-token-secret",
	} as Cloudflare.Env;
}
