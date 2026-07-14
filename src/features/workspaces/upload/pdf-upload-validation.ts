import { requestWorkspaceFileProcessor } from "#/features/workspaces/files/workspace-file-processor";
import { WorkspaceFileUploadError } from "#/features/workspaces/model/workspace-file";

export async function assertReadablePdfUpload(input: {
	env: Cloudflare.Env;
	object: R2ObjectBody;
}): Promise<void> {
	const response = await requestWorkspaceFileProcessor(input.env, {
		body: input.object.body,
		contentType: "application/pdf",
		path: "/validate/pdf",
		sizeBytes: input.object.size,
	});

	if (response.ok) {
		return;
	}

	const payload = await readValidationFailure(response);

	if (payload.code === "PASSWORD_PROTECTED_PDF") {
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
}

async function readValidationFailure(response: Response) {
	const payload: unknown = await response.json().catch(() => null);

	if (typeof payload !== "object" || payload === null) {
		return { code: null };
	}

	const code = "code" in payload && typeof payload.code === "string" ? payload.code : null;
	return { code };
}
