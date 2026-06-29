import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { Badge } from "#/components/ui/badge";
import type { AIInspectorRunView } from "#/features/workspaces/ai/ai-inspector-view-model";
import { cn } from "#/lib/utils";

export function InspectorBlock({
	children,
	icon: Icon,
	title,
	tone,
}: {
	children: ReactNode;
	icon: ComponentType<{ className?: string }>;
	title: string;
	tone?: "destructive";
}) {
	return (
		<section className="grid gap-2 rounded-md border bg-background p-3">
			<div className="flex items-center gap-2">
				<Icon
					className={cn(
						"size-4 text-muted-foreground",
						tone === "destructive" && "text-destructive",
					)}
					aria-hidden="true"
				/>
				<h3 className="font-medium text-sm">{title}</h3>
			</div>
			{children}
		</section>
	);
}

export function JsonDisclosure({ title, value }: { title: string; value: unknown }) {
	return (
		<details className="min-w-0 max-w-full overflow-hidden rounded-md border bg-muted/20">
			<summary className="min-w-0 cursor-pointer truncate px-3 py-2 font-medium text-xs marker:content-none">
				{title}
			</summary>
			<JsonBlock className="rounded-none border-x-0 border-b-0" value={value} />
		</details>
	);
}

export function TextDisclosure({ text, title }: { text: string; title: string }) {
	return (
		<details className="min-w-0 max-w-full overflow-hidden rounded-md border bg-muted/20">
			<summary className="min-w-0 cursor-pointer truncate px-3 py-2 font-medium text-xs marker:content-none">
				{title}
			</summary>
			<div className="border-t">
				<TextBlock className="rounded-none border-0" text={text} />
			</div>
		</details>
	);
}

export function TextBlock({ className, text }: { className?: string; text: string }) {
	return (
		<div
			className={cn(
				"max-h-72 min-w-0 max-w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-sm leading-relaxed [overflow-wrap:anywhere]",
				className,
			)}
		>
			{text}
		</div>
	);
}

export function JsonBlock({ className, value }: { className?: string; value: unknown }) {
	return (
		<pre
			className={cn(
				"max-h-96 w-full min-w-0 max-w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-4 [overflow-wrap:anywhere]",
				className,
			)}
		>
			{formatJson(value)}
		</pre>
	);
}

export function EmptyState({ children }: { children: ReactNode }) {
	return <p className="text-muted-foreground text-sm">{children}</p>;
}

export function Metric({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="rounded-md border bg-muted/20 px-3 py-2">
			<div className="text-muted-foreground text-xs">{label}</div>
			<div className="truncate font-medium text-sm">{value}</div>
		</div>
	);
}

export function StatusBadge({ status }: { status: AIInspectorRunView["status"] }) {
	if (status === "failed") {
		return (
			<Badge variant="destructive" className="rounded-full font-normal">
				<AlertTriangle className="size-3" aria-hidden="true" />
				Failed
			</Badge>
		);
	}

	if (status === "completed") {
		return (
			<Badge variant="secondary" className="rounded-full font-normal">
				<CheckCircle2 className="size-3" aria-hidden="true" />
				Completed
			</Badge>
		);
	}

	return (
		<Badge variant="outline" className="rounded-full font-normal">
			Running
		</Badge>
	);
}

export function formatUsage(usage: unknown) {
	const record = usage && typeof usage === "object" ? usage : undefined;
	if (!record) {
		return "none";
	}

	const usageRecord = record as Record<string, unknown>;
	const input = getTokenTotal(usageRecord.inputTokens);
	const output = getTokenTotal(usageRecord.outputTokens);
	const total = getNumber(usageRecord.totalTokens);

	if (typeof total === "number") {
		return `${total} tokens`;
	}

	if (typeof input === "number" || typeof output === "number") {
		return `${input ?? 0} in / ${output ?? 0} out`;
	}

	return "captured";
}

function formatJson(value: unknown) {
	if (typeof value === "string") {
		const parsed = safeParseJson(value);
		return JSON.stringify(parsed, null, 2);
	}

	return JSON.stringify(value ?? null, null, 2);
}

function safeParseJson(value: string) {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function getNumber(value: unknown) {
	return typeof value === "number" ? value : undefined;
}

function getTokenTotal(value: unknown) {
	if (typeof value === "number") {
		return value;
	}

	if (!value || typeof value !== "object") {
		return undefined;
	}

	return getNumber((value as Record<string, unknown>).total);
}
