import { ArrowUp, Eye, Globe2, PencilLine, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { getWorkspaceAiChatModelById } from "#/features/workspaces/ai/models";
import { ProviderLogo } from "#/features/workspaces/components/ai-chat/ProviderLogo";
import { cn } from "#/lib/utils";

const chatContextExamples = [
	{
		id: "workspace",
		icon: Eye,
		summary: "Read textbook (pages 50-60)",
	},
	{
		id: "research",
		icon: Globe2,
		summary: "Found 12 research papers",
	},
	{
		id: "tools",
		icon: PencilLine,
		summary: "Created report document",
	},
] as const;

export function WorkspaceChatVisual() {
	const [isSubmitted, setIsSubmitted] = useState(false);
	const [visibleToolCount, setVisibleToolCount] = useState(0);
	const [showAnswer, setShowAnswer] = useState(false);

	useEffect(() => {
		if (!isSubmitted) {
			return;
		}

		const timeouts = [
			window.setTimeout(() => setVisibleToolCount(1), 360),
			window.setTimeout(() => setVisibleToolCount(2), 820),
			window.setTimeout(() => setVisibleToolCount(3), 1280),
			window.setTimeout(() => setShowAnswer(true), 1750),
		];

		return () => {
			for (const timeout of timeouts) {
				window.clearTimeout(timeout);
			}
		};
	}, [isSubmitted]);

	function handleSubmit() {
		setVisibleToolCount(0);
		setShowAnswer(false);
		setIsSubmitted(true);
	}

	return (
		<div className="flex min-h-52 w-full flex-col text-sm">
			<div className="flex min-h-0 flex-1 flex-col justify-end pb-3">
				<div
					className={cn(
						"grid gap-2.5 transition-all duration-500 ease-out",
						isSubmitted
							? "translate-y-0 opacity-100"
							: "pointer-events-none translate-y-2 opacity-0",
					)}
					aria-hidden={!isSubmitted}
				>
					<div className="relative ml-auto max-w-[92%] rounded-2xl bg-blue-600 px-3 py-2 text-white leading-5">
						Compare my sources and write a report.
					</div>
					<div className="space-y-1.5">
						<p className="text-foreground/85">Of course!</p>
						<div className="space-y-1">
							{chatContextExamples.map((context, index) => {
								const Icon = context.icon;
								const isVisible = index < visibleToolCount;

								return (
									<div
										key={context.id}
										className={cn(
											"flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-muted-foreground transition-all duration-500 ease-out",
											isVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
										)}
									>
										<Icon className="size-3.5 shrink-0" aria-hidden="true" />
										<span className="truncate">{context.summary}</span>
									</div>
								);
							})}
						</div>
					</div>
					<div
						className={cn(
							"space-y-1.5 transition-all duration-700 ease-out",
							showAnswer ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
						)}
					>
						<p className="leading-5 text-foreground/85">
							I drafted a report from the textbook, research papers, and workspace notes.
						</p>
					</div>
				</div>
			</div>
			<div className="rounded-xl border border-border/35 bg-muted/30 p-2 shadow-none">
				<div className="min-h-9 px-1.5 py-2 text-foreground text-sm">
					{isSubmitted ? (
						<span className="text-muted-foreground/70">Ask a follow-up...</span>
					) : (
						<span>Compare my sources and write a report.</span>
					)}
				</div>
				<div className="flex items-center justify-between gap-2 pt-0.5 pr-0.5 pl-0.5">
					<div className="flex min-w-0 items-center gap-0.5">
						<span
							className="flex size-8 shrink-0 items-center justify-center text-muted-foreground/50"
							aria-hidden="true"
						>
							<Plus className="size-4" />
						</span>
						<span className="flex h-8 min-w-0 items-center gap-1.5 px-1.5 text-muted-foreground/60">
							<ProviderLogo provider="anthropic" className="size-3.5 shrink-0 opacity-60" />
							<span className="truncate text-xs">
								{getWorkspaceAiChatModelById("claude-sonnet").name}
							</span>
						</span>
					</div>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={isSubmitted}
						className={cn(
							"relative isolate flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-blue-600 pr-3.5 pl-3 font-semibold text-white shadow-[0_8px_18px_color-mix(in_oklch,var(--color-blue-600)_28%,transparent)] outline-none transition-[background-color,box-shadow,filter] hover:bg-blue-700 hover:shadow-[0_10px_24px_color-mix(in_oklch,var(--color-blue-600)_36%,transparent)] focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-55",
							!isSubmitted && "landing-send-pulse",
						)}
						aria-label="Send message"
					>
						<ArrowUp className="size-4" aria-hidden="true" />
						<span className="text-xs font-medium">Send</span>
					</button>
				</div>
			</div>
		</div>
	);
}
