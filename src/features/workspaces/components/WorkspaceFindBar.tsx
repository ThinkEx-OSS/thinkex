import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";
import { type ComponentProps, type KeyboardEvent, type RefObject, useEffect, useRef } from "react";

import { useWorkspacePaneHotkey } from "#/features/workspaces/components/WorkspacePaneRuntime";
import { useWorkspaceFindStore } from "#/features/workspaces/find/workspace-find-store";
import type {
	WorkspaceFindEngine,
	WorkspaceFindState,
} from "#/features/workspaces/find/use-workspace-find";
import { getAppHotkey } from "#/lib/hotkeys-core";
import { cn } from "#/lib/utils";

/**
 * The one find bar. Every searchable surface renders this against its own
 * engine, so Mod+F looks and behaves the same in a document, a PDF, and chat.
 * Owns its open state and its hotkey; the surface only supplies the engine.
 */
export function WorkspaceFindBar({
	engine,
	find,
	findId,
	label,
	className,
	hotkeyTarget,
}: {
	engine: WorkspaceFindEngine;
	find: WorkspaceFindState;
	/** Identifies this surface, so only its bar is open at a time. */
	findId: string;
	/** Names the surface being searched, e.g. "Find in document". */
	label: string;
	/** Only for surfaces whose own chrome occupies the top-right corner. */
	className?: string;
	/** Scopes the hotkey to one element. Surfaces that own a pane omit it. */
	hotkeyTarget?: RefObject<HTMLElement | null>;
}) {
	const isOpen = useWorkspaceFindStore((state) => state.openFindId === findId);
	const openFind = useWorkspaceFindStore((state) => state.openFind);
	const closeFind = useWorkspaceFindStore((state) => state.closeFind);
	const inputRef = useRef<HTMLInputElement>(null);
	const hasQuery = find.query !== "";
	const hasMatches = engine.total > 0;

	useWorkspacePaneHotkey(
		getAppHotkey("workspace.find.open").hotkey,
		() => {
			// Already open: the input exists, so select what is in it. Otherwise the
			// effect below focuses it once it mounts.
			if (isOpen) {
				inputRef.current?.focus();
				inputRef.current?.select();
				return;
			}

			openFind(findId);
		},
		// ignoreInputs would drop the hotkey whenever the caret sits in a text field,
		// and the library counts contenteditable as one — so Mod+F would do nothing
		// in exactly the place you reach for it. A modifier combo is safe to accept.
		{ conflictBehavior: "allow", ignoreInputs: false, target: hotkeyTarget },
	);

	useEffect(() => {
		if (isOpen) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [isOpen]);

	// A bar can unmount while still open — switching tabs, closing the item. Its
	// id would outlive it, and the next Escape would go on dismissing a find bar
	// that is no longer there instead of closing what is.
	useEffect(
		() => () => {
			const store = useWorkspaceFindStore.getState();

			if (store.openFindId === findId) {
				store.closeFind();
			}
		},
		[findId],
	);

	if (!isOpen) {
		return null;
	}

	const close = () => {
		closeFind();
		find.setQuery("");
	};
	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Escape") {
			// The surfaces underneath bind Escape too; this one closes the bar only.
			event.preventDefault();
			event.stopPropagation();
			close();
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
		<search
			aria-label={label}
			data-prevent-type-to-focus
			data-workspace-find-bar
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
					hasQuery && !hasMatches && !engine.isSearching && "text-destructive",
				)}
			>
				{!hasQuery
					? null
					: hasMatches
						? `${engine.activeIndex + 1} of ${engine.total}`
						: engine.isSearching
							? "Searching"
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
			<FindBarButton aria-label="Close find bar" onClick={close}>
				<X className="size-4" />
			</FindBarButton>
		</search>
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
