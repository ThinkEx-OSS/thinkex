import { AlertTriangle, Code2, FileText, MessageSquare, Settings2 } from "lucide-react";

import { Badge } from "#/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import type { AIInspectorEvent } from "#/features/workspaces/ai/ai-inspector";
import type {
	AIInspectorRunView,
	AIInspectorToolDefinitionView,
} from "#/features/workspaces/ai/ai-inspector-view-model";
import {
	EmptyState,
	formatUsage,
	InspectorBlock,
	JsonBlock,
	JsonDisclosure,
	Metric,
	StatusBadge,
	TextDisclosure,
} from "#/features/workspaces/components/ai-chat/AiChatInspectorBlocks";
import { ConversationPanel } from "#/features/workspaces/components/ai-chat/AiChatInspectorConversation";

export function AIInspectorRunPanel({ run }: { run: AIInspectorRunView }) {
	return (
		<section className="grid gap-4">
			<RunSummary run={run} />
			<Tabs defaultValue="conversation" className="gap-4">
				<TabsList variant="line" className="w-full justify-start overflow-x-auto">
					<TabsTrigger value="conversation">
						<MessageSquare className="size-3.5" aria-hidden="true" />
						Conversation
					</TabsTrigger>
					<TabsTrigger value="context">
						<FileText className="size-3.5" aria-hidden="true" />
						Context
					</TabsTrigger>
					<TabsTrigger value="raw">
						<Code2 className="size-3.5" aria-hidden="true" />
						Raw events
					</TabsTrigger>
				</TabsList>
				<TabsContent value="conversation">
					<ConversationPanel run={run} />
				</TabsContent>
				<TabsContent value="context">
					<ContextPanel run={run} />
				</TabsContent>
				<TabsContent value="raw">
					<RawPanel events={run.rawEvents} />
				</TabsContent>
			</Tabs>
		</section>
	);
}

function RunSummary({ run }: { run: AIInspectorRunView }) {
	return (
		<div className="grid gap-3 rounded-md border bg-background p-3">
			<div className="flex flex-wrap items-center gap-2">
				<StatusBadge status={run.status} />
				<span className="min-w-0 truncate font-mono text-muted-foreground text-xs">
					{run.runId}
				</span>
				{run.modelId ? (
					<Badge variant="outline" className="rounded-full font-normal">
						{run.modelId}
					</Badge>
				) : null}
			</div>
			<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
				<Metric label="Steps" value={run.steps.length} />
				<Metric label="Tool calls" value={run.toolCalls.length} />
				<Metric label="Usage" value={formatUsage(run.usage)} />
				<Metric label="Duration" value={formatDuration(run)} />
			</div>
		</div>
	);
}

function ContextPanel({ run }: { run: AIInspectorRunView }) {
	const messages = run.messages.length > 0 ? run.messages : run.steps[0]?.messages;

	return (
		<div className="grid gap-4">
			{run.error ? (
				<InspectorBlock icon={AlertTriangle} title="Turn error" tone="destructive">
					<JsonBlock value={run.error} />
				</InspectorBlock>
			) : null}
			{run.system ? <TextDisclosure title="System prompt" text={run.system} /> : null}
			{messages && messages.length > 0 ? (
				<JsonDisclosure title="Turn input" value={messages.map((message) => message.raw)} />
			) : null}
			<AvailableToolsDisclosure tools={run.tools} />
			{run.body ? <JsonDisclosure title="Request body" value={run.body} /> : null}
			{run.thread ? <JsonDisclosure title="Thread context" value={run.thread} /> : null}
			{!run.system && (!messages || messages.length === 0) ? (
				<EmptyState>No run context captured.</EmptyState>
			) : null}
		</div>
	);
}

function AvailableToolsDisclosure({ tools }: { tools: AIInspectorToolDefinitionView[] }) {
	if (tools.length === 0) {
		return null;
	}

	return (
		<details className="min-w-0 max-w-full overflow-hidden rounded-md border bg-muted/20">
			<summary className="flex min-w-0 cursor-pointer items-center gap-2 px-3 py-2 font-medium text-xs marker:content-none">
				<Settings2 className="size-3.5 text-muted-foreground" />
				Available tools
				<span className="ml-auto text-muted-foreground">{tools.length} tools</span>
			</summary>
			<div className="grid min-w-0 max-w-full gap-2 overflow-hidden border-t p-3">
				{tools.map((tool) => (
					<ToolDefinitionCard key={tool.name} tool={tool} />
				))}
			</div>
		</details>
	);
}

function ToolDefinitionCard({ tool }: { tool: AIInspectorToolDefinitionView }) {
	return (
		<details className="min-w-0 max-w-full overflow-hidden rounded-md border bg-background">
			<summary className="flex min-w-0 cursor-pointer items-center gap-2 px-3 py-2 marker:content-none">
				<span className="shrink-0 font-mono text-sm">{tool.name}</span>
				{tool.description ? (
					<span className="min-w-0 truncate text-muted-foreground text-xs">{tool.description}</span>
				) : null}
			</summary>
			<div className="grid gap-2 border-t p-3">
				{tool.description ? (
					<p className="text-muted-foreground text-sm">{tool.description}</p>
				) : null}
				<JsonDisclosure title="Input schema" value={tool.inputSchema} />
				{tool.outputSchema ? (
					<JsonDisclosure title="Output schema" value={tool.outputSchema} />
				) : null}
			</div>
		</details>
	);
}

function RawPanel({ events }: { events: AIInspectorEvent[] }) {
	return (
		<div className="grid gap-2">
			{events.map((event) => (
				<details key={event.id} className="group rounded-md border bg-background">
					<summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm marker:content-none">
						<Badge variant="secondary" className="rounded-full font-normal text-[10px]">
							{event.sequence}
						</Badge>
						<span className="font-medium">{event.type}</span>
						<span className="ml-auto text-muted-foreground text-xs">
							{formatInspectorTime(event.createdAt)}
						</span>
					</summary>
					<JsonBlock className="rounded-none border-x-0 border-b-0" value={event.payload} />
				</details>
			))}
		</div>
	);
}

const inspectorTimeFormatter = new Intl.DateTimeFormat(undefined, {
	hour: "numeric",
	minute: "2-digit",
	second: "2-digit",
});

function formatInspectorTime(timestamp: number) {
	return inspectorTimeFormatter.format(new Date(timestamp));
}

function formatDuration(run: AIInspectorRunView) {
	if (!run.startedAt) {
		return "unknown";
	}

	const end = run.finishedAt ?? Date.now();
	const durationMs = Math.max(0, end - run.startedAt);
	if (durationMs < 1000) {
		return `${durationMs}ms`;
	}

	return `${(durationMs / 1000).toFixed(1)}s`;
}
