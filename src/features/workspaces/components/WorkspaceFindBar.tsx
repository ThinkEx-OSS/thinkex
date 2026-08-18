import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";
import { type ComponentProps, useEffect, useRef } from "react";

import type { WorkspaceFindEngine } from "#/features/workspaces/find/workspace-find-engine";
import type { WorkspaceFindState } from "#/features/workspaces/find/use-workspace-find";
import { cn } from "#/lib/utils";

/**
 * The one find bar. Every searchable surface renders this against its own
 * engine, so Mod+F looks and behaves the same in a document, a PDF, and chat.
 */
export function WorkspaceFindBar({
	engine,
	find,
	label,
	className,
}: {
	engine: WorkspaceFindEngine;
	find: WorkspaceFindState;
	/** Names the surface being searched, e.g. "Find in document". */
	label: string;
	/** Only for surfaces whose own chrome occupies the top-right corner. */
	className?: string;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const hasQuery = find.query !== "";
	const hasMatches = engine.total > 0;

	// Every open request re-focuses, so pressing the hotkey again selects what is
	// already typed rather than doing nothing.
	useEffect(() => {
		if (find.isOpen) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [find.isOpen, find.openCount]);

	if (!find.isOpen) {
		return null;
	}

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Escape") {
			// The surfaces underneath bind Escape too; this one closes the bar only.
			event.preventDefault();
			event.stopPropagation();
			find.close();
			return;
		}

		if (event.key === "Enter") {
			event.preventDefault();

			if (event.shiftKey) {
				engine.previous();
			} else {
				engine.next();
			}
		}
	};

	return (
		<div
			role="search"
			aria-label={label}
			data-prevent-type-to-focus
			className={cn(
				"pointer-events-auto absolute top-3 right-3 z-30 flex items-center gap-1 rounded-lg border border-border bg-background/95 py-1 pr-1 pl-2 shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/85",
				className,
			)}
		>
			<input
				ref={inputRef}
				value={find.rawQuery}
				aria-label={label}
				placeholder={label}
				autoComplete="off"
				spellCheck={false}
				className="h-7 w-44 min-w-0 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground/60"
				onChange={(event) => find.setQuery(event.target.value)}
				onKeyDown={handleKeyDown}
			/>
			<span
				aria-live="polite"
				className={cn(
					"min-w-12 text-right text-muted-foreground text-xs tabular-nums",
					hasQuery && !engine.isSearching && !hasMatches && "text-destructive",
				)}
			>
				{!hasQuery
					? null
					: engine.isSearching
						? "Searching"
						: hasMatches
							? `${engine.activeIndex + 1} of ${engine.total}`
							: "No matches"}
			</span>
			<FindBarButton
				aria-label="Match case"
				aria-pressed={find.caseSensitive}
				className={cn(find.caseSensitive && "bg-muted text-foreground")}
				onClick={find.toggleCaseSensitive}
			>
				<CaseSensitive className="size-4" />
			</FindBarButton>
			<FindBarButton aria-label="Previous match" disabled={!hasMatches} onClick={engine.previous}>
				<ChevronUp className="size-4" />
			</FindBarButton>
			<FindBarButton aria-label="Next match" disabled={!hasMatches} onClick={engine.next}>
				<ChevronDown className="size-4" />
			</FindBarButton>
			<FindBarButton aria-label="Close find bar" onClick={find.close}>
				<X className="size-4" />
			</FindBarButton>
		</div>
	);
}

function FindBarButton({ className, ...props }: ComponentProps<"button">) {
	return (
		<button
			type="button"
			// Keeping focus in the input is what every find bar does; refusing it
			// here beats snatching it back after the click.
			onMouseDown={(event) => event.preventDefault()}
			className={cn(
				"inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
				className,
			)}
			{...props}
		/>
	);
}
