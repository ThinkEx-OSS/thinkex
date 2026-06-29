import { useAgent } from "agents/react";
import { useState } from "react";

import { userAIAgentName, userAIBasePath } from "#/features/workspaces/agent-routes";
import type { AIInspectorSnapshot } from "#/features/workspaces/ai/ai-inspector";
import type { AIThreadSummary, UserAIStoreState } from "#/features/workspaces/ai/user-ai-agents";

interface UseWorkspaceAiChatThreadsOptions {
	workspaceId: string;
}

export function useWorkspaceAiChatThreads({ workspaceId }: UseWorkspaceAiChatThreadsOptions) {
	const [isCreatingThread, setIsCreatingThread] = useState(false);
	const directory = useAgent<UserAIStoreState>({
		agent: userAIAgentName,
		basePath: userAIBasePath,
	});

	const threads = (directory.state?.threads ?? []).filter(
		(thread) => thread.workspaceId === workspaceId,
	);

	const createThread = async () => {
		setIsCreatingThread(true);

		try {
			const thread = await directory.call<AIThreadSummary>("createThread", [{ workspaceId }]);
			setIsCreatingThread(false);
			return thread;
		} catch (error) {
			setIsCreatingThread(false);
			throw error;
		}
	};

	const deleteThread = async (threadId: string) => {
		await directory.call("deleteThread", [threadId]);
	};

	const markThreadViewed = async (threadId: string) => {
		await directory.call("markThreadViewed", [threadId]);
	};

	const getThreadInspectorSnapshot = async (threadId: string): Promise<AIInspectorSnapshot> => {
		return await directory.call<AIInspectorSnapshot>("getThreadInspectorSnapshot", [threadId]);
	};

	return {
		createThread,
		deleteThread,
		directory,
		getThreadInspectorSnapshot: import.meta.env.DEV ? getThreadInspectorSnapshot : undefined,
		isCreatingThread,
		isReady: directory.state?.isLoaded === true,
		markThreadViewed,
		threads,
	};
}
