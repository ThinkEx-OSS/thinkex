import { batchWorkspaceSearchValues } from "#/features/workspaces/search/workspace-search-batches";

const workspaceSearchEmbeddingModel = "@cf/baai/bge-m3";
const embeddingBatchSize = 16;

export async function embedWorkspaceSearchTexts(ai: Ai, texts: string[]) {
	const embeddings: number[][] = [];
	for (const batch of batchWorkspaceSearchValues(texts, embeddingBatchSize)) {
		const output: unknown = await ai.run(workspaceSearchEmbeddingModel, {
			text: batch,
			truncate_inputs: true,
		});
		embeddings.push(...readEmbeddingData(output));
	}
	return embeddings;
}

function readEmbeddingData(output: unknown): number[][] {
	if (!isRecord(output) || !Array.isArray(output.data)) {
		throw new Error("Workspace search embedding response is missing vector data.");
	}

	const data = output.data.filter(
		(vector): vector is number[] =>
			Array.isArray(vector) && vector.every((value) => typeof value === "number"),
	);
	if (data.length !== output.data.length) {
		throw new Error("Workspace search embedding response contains invalid vector data.");
	}
	return data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
