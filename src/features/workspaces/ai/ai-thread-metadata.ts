// The identity and permission scope a tool run executes under, threaded from
// the turn endpoint into every tool factory.

export interface AIThreadContext {
	id: string;
	workspaceId: string;
	promptScope: AIThreadPromptScope;
	userId: string;
}

export interface AIThreadPromptScope {
	canMutate: boolean;
	workspaceName: string;
}
