import { readWorkspaceFileSource } from "#/features/workspaces/persistence/workspace-files";

export async function getWorkspaceFileSourceObject(input: {
	env: Cloudflare.Env;
	itemId: string;
	workspaceId: string;
}) {
	const source = await readWorkspaceFileSource({
		itemId: input.itemId,
		workspaceId: input.workspaceId,
	});
	const object = await input.env.WORKSPACE_FILES.get(source.objectKey);

	if (!object) {
		throw new Error("Workspace file source object was not found.");
	}

	if (object.size !== source.sizeBytes) {
		throw new Error("Workspace file source size does not match its metadata.");
	}

	return { object, source };
}
