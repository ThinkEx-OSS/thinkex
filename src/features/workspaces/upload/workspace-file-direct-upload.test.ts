import { afterEach, describe, expect, it, vi } from "vitest";

import {
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
		const [payload, signature] = session.completionToken.split(".") as [string, string];
		const tamperedPayload = `${payload.startsWith("x") ? "y" : "x"}${payload.slice(1)}`;
		const tampered = `${tamperedPayload}.${signature}`;

		await expect(verifyWorkspaceDirectUploadToken(env, tampered)).rejects.toThrow("invalid");

		vi.setSystemTime(new Date("2026-07-14T12:31:00Z"));
		await expect(verifyWorkspaceDirectUploadToken(env, session.completionToken)).rejects.toThrow(
			"expired",
		);
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
