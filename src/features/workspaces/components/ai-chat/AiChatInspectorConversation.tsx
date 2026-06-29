import { Bot, Brain, type LucideIcon, User, Wrench } from "lucide-react";

import { Badge } from "#/components/ui/badge";
import type {
	AIInspectorMessageView,
	AIInspectorRunView,
	AIInspectorStepView,
	AIInspectorToolCallView,
} from "#/features/workspaces/ai/ai-inspector-view-model";
import {
	EmptyState,
	formatUsage,
	JsonDisclosure,
	TextBlock,
	TextDisclosure,
} from "#/features/workspaces/components/ai-chat/AiChatInspectorBlocks";
import { cn } from "#/lib/utils";

export function ConversationPanel({ run }: { run: AIInspectorRunView }) {
	const messages = run.messages.length > 0 ? run.messages : run.steps[0]?.messages;
	const hasMessages = messages && messages.length > 0;
	const hasSteps = run.steps.length > 0;

	if (!hasMessages && !hasSteps && !run.error) {
		return <EmptyState>No conversation captured for this run.</EmptyState>;
	}

	return (
		<div className="grid gap-4">
			{messages?.map((message, index) => (
				<ConversationMessage key={getConversationMessageKey(message, index)} message={message} />
			))}
			{run.steps.map((step) => (
				<ConversationStep key={step.stepNumber} run={run} step={step} />
			))}
			{run.error ? (
				<div className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
					<ConversationHeader icon={Bot} label="Agent error" tone="destructive" />
					<JsonDisclosure title="Error" value={run.error} />
				</div>
			) : null}
		</div>
	);
}

function ConversationMessage({ message }: { message: AIInspectorMessageView }) {
	const role = message.role ?? "message";
	const isUser = role === "user";
	const isSystem = role === "system";

	return (
		<article
			className={cn(
				"grid w-full min-w-0 max-w-4xl gap-2 overflow-hidden rounded-md border bg-background p-3",
				isUser && "ml-auto w-full border-border bg-muted",
				isSystem && "border-muted-foreground/20 bg-muted/20",
			)}
		>
			<ConversationHeader
				icon={isUser ? User : Bot}
				label={formatRole(role)}
				meta={
					message.toolCalls.length > 0
						? `${message.toolCalls.length} tool part${message.toolCalls.length === 1 ? "" : "s"}`
						: undefined
				}
			/>
			{message.text ? <TextBlock text={message.text} /> : null}
			{message.toolCalls.map((toolCall) => (
				<JsonDisclosure
					key={getToolPreviewKey(toolCall)}
					title={toolCall.toolName ?? toolCall.type ?? "tool part"}
					value={toolCall}
				/>
			))}
			<JsonDisclosure title="Raw message" value={message.raw} />
		</article>
	);
}

function ConversationStep({ run, step }: { run: AIInspectorRunView; step: AIInspectorStepView }) {
	return (
		<article className="grid w-full min-w-0 max-w-4xl gap-2 overflow-hidden rounded-md border bg-background p-3">
			<ConversationHeader
				icon={Bot}
				label="Agent"
				meta={`Step ${step.stepNumber}${step.finishReason ? ` · ${step.finishReason}` : ""}`}
			/>
			<ModelInputDetails run={run} step={step} />
			{step.toolCalls.length > 0 ? (
				<div className="grid gap-2">
					{step.toolCalls.map((toolCall) => (
						<ConversationToolCall key={toolCall.id} toolCall={toolCall} />
					))}
				</div>
			) : null}
			{step.reasoning ? (
				<details className="rounded-md border bg-muted/20">
					<summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-medium text-xs marker:content-none">
						<Brain className="size-3.5 text-muted-foreground" />
						Reasoning
					</summary>
					<div className="border-t p-3">
						<TextBlock text={step.reasoning} />
					</div>
				</details>
			) : null}
			{step.text ? <TextBlock text={step.text} /> : null}
		</article>
	);
}

function ModelInputDetails({ run, step }: { run: AIInspectorRunView; step: AIInspectorStepView }) {
	return (
		<details className="min-w-0 max-w-full overflow-hidden rounded-md border bg-muted/20">
			<summary className="flex min-w-0 cursor-pointer items-center gap-2 px-3 py-2 font-medium text-xs marker:content-none">
				<Brain className="size-3.5 text-muted-foreground" />
				Model context
				<span className="ml-auto text-muted-foreground">
					{step.messages.length} messages
					{step.usage ? ` · ${formatUsage(step.usage)}` : ""}
				</span>
			</summary>
			<div className="grid min-w-0 max-w-full gap-2 overflow-hidden border-t p-3">
				{run.system ? <TextDisclosure title="System prompt" text={run.system} /> : null}
				<JsonDisclosure title="Messages sent to this step" value={step.messages} />
				{run.tools.length > 0 ? <JsonDisclosure title="Available tools" value={run.tools} /> : null}
				{run.body ? <JsonDisclosure title="Turn request body" value={run.body} /> : null}
				{step.usage ? <JsonDisclosure title="Usage" value={step.usage} /> : null}
				{hasInspectorValue(step.warnings) ? (
					<JsonDisclosure title="Warnings" value={step.warnings} />
				) : null}
				{hasInspectorValue(step.sources) ? (
					<JsonDisclosure title="Sources" value={step.sources} />
				) : null}
				{hasInspectorValue(step.files) ? <JsonDisclosure title="Files" value={step.files} /> : null}
				{step.request ? <JsonDisclosure title="Provider request" value={step.request} /> : null}
				{step.response ? <JsonDisclosure title="Provider response" value={step.response} /> : null}
				{step.providerMetadata ? (
					<JsonDisclosure title="Provider metadata" value={step.providerMetadata} />
				) : null}
				{step.otherChunks.length > 0 ? (
					<JsonDisclosure title="Raw stream internals" value={step.otherChunks} />
				) : null}
			</div>
		</details>
	);
}

function ConversationToolCall({ toolCall }: { toolCall: AIInspectorToolCallView }) {
	return (
		<details className="min-w-0 max-w-full overflow-hidden rounded-md border bg-muted/20">
			<summary className="flex min-w-0 cursor-pointer items-center gap-2 px-3 py-2 marker:content-none">
				<Wrench className="size-3.5 text-muted-foreground" aria-hidden="true" />
				<span className="font-mono text-xs">{toolCall.toolName}</span>
				<Badge
					variant={toolCall.success === false ? "destructive" : "secondary"}
					className="rounded-full font-normal text-[10px]"
				>
					{toolCall.success === false ? "failed" : "called"}
				</Badge>
				{typeof toolCall.durationMs === "number" ? (
					<span className="ml-auto text-muted-foreground text-xs">{toolCall.durationMs}ms</span>
				) : null}
			</summary>
			<div className="grid min-w-0 max-w-full gap-2 overflow-hidden border-t p-3">
				<JsonDisclosure title="Input" value={toolCall.input} />
				{toolCall.output !== undefined ? (
					<JsonDisclosure title="Output" value={toolCall.output} />
				) : null}
				{toolCall.error !== undefined ? (
					<JsonDisclosure title="Error" value={toolCall.error} />
				) : null}
			</div>
		</details>
	);
}

function ConversationHeader({
	icon: Icon,
	label,
	meta,
	tone,
}: {
	icon: LucideIcon;
	label: string;
	meta?: string;
	tone?: "destructive";
}) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<Icon
				className={cn("size-4 text-muted-foreground", tone === "destructive" && "text-destructive")}
				aria-hidden="true"
			/>
			<span className="font-medium text-sm">{label}</span>
			{meta ? <span className="min-w-0 truncate text-muted-foreground text-xs">{meta}</span> : null}
		</div>
	);
}

function formatRole(role: string) {
	return role.charAt(0).toUpperCase() + role.slice(1);
}

function getConversationMessageKey(message: AIInspectorMessageView, index: number) {
	return [
		index,
		message.role,
		message.text,
		message.toolCalls.map(getToolPreviewKey).join(","),
	].join(":");
}

function getToolPreviewKey(toolCall: AIInspectorMessageView["toolCalls"][number]) {
	return [
		toolCall.type,
		toolCall.toolName,
		toolCall.toolCallId,
		JSON.stringify(toolCall.input ?? toolCall.output ?? toolCall.text ?? null),
	].join(":");
}

function hasInspectorValue(value: unknown) {
	if (Array.isArray(value)) {
		return value.length > 0;
	}

	return value !== undefined && value !== null;
}
