import type { AIInspectorEvent } from "#/features/workspaces/ai/ai-inspector";

export interface AIInspectorToolDefinitionView {
	name: string;
	description?: string;
	inputSchema?: unknown;
	outputSchema?: unknown;
	metadata?: unknown;
	strict?: unknown;
	title?: string;
}

export interface AIInspectorMessageView {
	role?: string;
	text: string;
	toolCalls: AIInspectorToolCallPreview[];
	raw: unknown;
}

export interface AIInspectorToolCallPreview {
	toolCallId?: string;
	toolName?: string;
	input?: unknown;
	output?: unknown;
	text?: string;
	type?: string;
}

export interface AIInspectorToolCallView {
	id: string;
	toolName: string;
	stepNumber?: number;
	startedAt?: number;
	finishedAt?: number;
	durationMs?: number;
	input?: unknown;
	output?: unknown;
	error?: unknown;
	success?: boolean;
}

export interface AIInspectorStepView {
	stepNumber: number;
	startedAt?: number;
	finishedAt?: number;
	messages: AIInspectorMessageView[];
	text: string;
	reasoning: string;
	finishReason?: string;
	files?: unknown;
	providerMetadata?: unknown;
	sources?: unknown;
	usage?: unknown;
	request?: unknown;
	response?: unknown;
	warnings?: unknown;
	otherChunks: unknown[];
	toolCalls: AIInspectorToolCallView[];
}

export interface AIInspectorRunView {
	runId: string;
	startedAt?: number;
	finishedAt?: number;
	status: "running" | "completed" | "failed";
	modelId?: string;
	system?: string;
	thread?: unknown;
	body?: unknown;
	tools: AIInspectorToolDefinitionView[];
	messages: AIInspectorMessageView[];
	steps: AIInspectorStepView[];
	toolCalls: AIInspectorToolCallView[];
	eventCount: number;
	usage?: unknown;
	error?: unknown;
	rawEvents: AIInspectorEvent[];
}
