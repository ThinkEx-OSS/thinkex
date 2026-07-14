import { AwsClient } from "aws4fetch";
import { z } from "zod";

import {
	getWorkspaceFileUploadCompletionKey,
	getWorkspaceFileUploadObjectKey,
} from "#/features/workspaces/files/workspace-file-object-keys";

const uploadUrlLifetimeSeconds = 30 * 60;
const uploadTokenVersion = 1;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const uploadClaimsSchema = z.object({
	clientMutationId: z.string().min(1),
	contentType: z.string().min(1),
	expiresAt: z.number().int().positive(),
	fileName: z.string().min(1),
	fileSize: z.number().int().positive(),
	itemId: z.uuid(),
	parentId: z.string().min(1).nullable(),
	userId: z.string().min(1),
	version: z.literal(uploadTokenVersion),
	workspaceId: z.string().min(1),
});

export type WorkspaceDirectUploadClaims = z.infer<typeof uploadClaimsSchema>;

export async function createWorkspaceDirectUploadSession(
	env: Cloudflare.Env,
	input: Omit<WorkspaceDirectUploadClaims, "expiresAt" | "itemId" | "version">,
) {
	const claims: WorkspaceDirectUploadClaims = {
		...input,
		expiresAt: Math.floor(Date.now() / 1_000) + uploadUrlLifetimeSeconds,
		itemId: crypto.randomUUID(),
		version: uploadTokenVersion,
	};
	const uploadUrl = await createPresignedUploadUrl(env, {
		contentType: claims.contentType,
		objectKey: getWorkspaceFileUploadObjectKey(claims),
	});

	return {
		completionToken: await signUploadClaims(env.WORKSPACE_UPLOAD_TOKEN_SECRET, claims),
		uploadUrl,
	};
}

export async function verifyWorkspaceDirectUploadToken(
	env: Cloudflare.Env,
	token: string,
): Promise<WorkspaceDirectUploadClaims> {
	const [encodedPayload, encodedSignature, extra] = token.split(".");

	if (!encodedPayload || !encodedSignature || extra) {
		throw new Error("Upload completion token is invalid.");
	}

	const key = await createSigningKey(env.WORKSPACE_UPLOAD_TOKEN_SECRET, ["verify"]);
	const valid = await crypto.subtle.verify(
		"HMAC",
		key,
		decodeBase64Url(encodedSignature),
		encoder.encode(encodedPayload),
	);

	if (!valid) {
		throw new Error("Upload completion token is invalid.");
	}

	const claims = uploadClaimsSchema.parse(JSON.parse(decodeBase64UrlText(encodedPayload)));

	if (claims.expiresAt < Math.floor(Date.now() / 1_000)) {
		throw new Error("Upload completion token has expired.");
	}

	return claims;
}

export async function claimWorkspaceDirectUploadCompletion(
	env: Cloudflare.Env,
	claims: WorkspaceDirectUploadClaims,
): Promise<string | null> {
	const objectKey = getWorkspaceFileUploadCompletionKey(claims);
	const claim = await env.WORKSPACE_KERNEL_FILES.put(objectKey, "", {
		onlyIf: { etagDoesNotMatch: "*" },
	});

	return claim ? objectKey : null;
}

async function createPresignedUploadUrl(
	env: Cloudflare.Env,
	input: { contentType: string; objectKey: string },
) {
	const client = new AwsClient({
		accessKeyId: env.R2_ACCESS_KEY_ID,
		region: "auto",
		secretAccessKey: env.R2_SECRET_ACCESS_KEY,
		service: "s3",
	});
	const objectPath = input.objectKey.split("/").map(encodeURIComponent).join("/");
	const bucketName = encodeURIComponent(env.R2_BUCKET_NAME);
	const url = new URL(
		`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucketName}/${objectPath}`,
	);
	url.searchParams.set("X-Amz-Expires", String(uploadUrlLifetimeSeconds));
	const signed = await client.sign(
		new Request(url, {
			headers: { "content-type": input.contentType },
			method: "PUT",
		}),
		{ aws: { signQuery: true } },
	);

	return signed.url;
}

async function signUploadClaims(secret: string, claims: WorkspaceDirectUploadClaims) {
	const payload = encodeBase64Url(encoder.encode(JSON.stringify(claims)));
	const key = await createSigningKey(secret, ["sign"]);
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
	return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

function createSigningKey(secret: string, usages: KeyUsage[]) {
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(`thinkex-workspace-upload:${secret}`),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		usages,
	);
}

function encodeBase64Url(bytes: Uint8Array) {
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string) {
	const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
	const binary = atob(padded);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeBase64UrlText(value: string) {
	return decoder.decode(decodeBase64Url(value));
}
