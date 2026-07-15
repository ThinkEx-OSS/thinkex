import type { WorkspaceKernelClient } from "#/features/workspaces/kernel/workspace-kernel-access";

export async function getWorkspaceFileSourceObject(input: {
	env: Cloudflare.Env;
	itemId: string;
	kernel: WorkspaceKernelClient;
}) {
	const source = await input.kernel.getFileSource({ itemId: input.itemId });
	const object = await input.env.WORKSPACE_KERNEL_FILES.get(source.objectKey);

	if (!object) {
		throw new Error("Workspace file source object was not found.");
	}

	if (object.size !== source.sizeBytes) {
		throw new Error("Workspace file source size does not match its metadata.");
	}

	return { object, source };
}
