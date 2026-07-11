import { getDocumentProxy } from "unpdf";

import { WorkspaceFileUploadError } from "#/features/workspaces/model/workspace-file";

export async function assertReadablePdfUpload(bytes: ArrayBuffer | Uint8Array): Promise<void> {
	let document: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;

	try {
		document = await getDocumentProxy(toUint8Array(bytes));
	} catch (error) {
		if (isPdfPasswordError(error)) {
			throw new WorkspaceFileUploadError({
				code: "PASSWORD_PROTECTED_PDF",
				message:
					"Password-protected PDFs aren’t supported. Remove the password and upload the PDF again.",
				status: 422,
			});
		}

		throw new WorkspaceFileUploadError({
			code: "INVALID_PDF",
			message: "This PDF is damaged or invalid and could not be opened.",
			status: 422,
		});
	} finally {
		await document?.destroy();
	}
}

function isPdfPasswordError(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"name" in error &&
		error.name === "PasswordException"
	);
}

function toUint8Array(bytes: ArrayBuffer | Uint8Array) {
	return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}
