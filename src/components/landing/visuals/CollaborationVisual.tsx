import { FilePen, MousePointer2 } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "#/lib/utils";

/** Cursor size, so it can be kept inside the card rather than escaping it. */
const USER_CURSOR_BOUNDS = { height: 38, padding: 4, width: 62 };

/** A shared document with peers editing it, and your own cursor following. */
export function CollaborationVisual() {
	const userCursorRef = useRef<HTMLDivElement | null>(null);
	const [userCursorVisible, setUserCursorVisible] = useState(false);

	return (
		<div
			className="relative h-full min-h-52 w-full max-w-xl cursor-none overflow-hidden p-1"
			// Written straight to the node. Holding the position in state re-rendered
			// this component and its three cursors on every mousemove, which on a
			// 120Hz trackpad is ~120 React renders a second for a decorative dot.
			onMouseMove={(event) => {
				const cursor = userCursorRef.current;

				if (!cursor) {
					return;
				}

				const rect = event.currentTarget.getBoundingClientRect();
				const x = Math.min(
					Math.max(event.clientX - rect.left, USER_CURSOR_BOUNDS.padding),
					rect.width - USER_CURSOR_BOUNDS.width,
				);
				const y = Math.min(
					Math.max(event.clientY - rect.top, USER_CURSOR_BOUNDS.padding),
					rect.height - USER_CURSOR_BOUNDS.height,
				);

				cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
				setUserCursorVisible(true);
			}}
			onMouseLeave={() => setUserCursorVisible(false)}
		>
			<div className="flex items-center gap-2 border-border/60 border-b pb-3">
				<FilePen className="size-5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
				<div className="text-base font-medium">Shared study guide</div>
				<div className="ml-auto flex -space-x-2" aria-hidden="true">
					<div className="grid size-7 place-items-center rounded-full border-2 border-background bg-sky-600 text-[0.62rem] font-medium text-white">
						TM
					</div>
					<div className="grid size-7 place-items-center rounded-full border-2 border-background bg-emerald-600 text-[0.62rem] font-medium text-white">
						VV
					</div>
					<div className="grid size-7 place-items-center rounded-full border-2 border-background bg-fuchsia-600 text-[0.62rem] font-medium text-white">
						MJ
					</div>
				</div>
			</div>
			<div className="space-y-3 pt-4 text-sm leading-6 text-muted-foreground">
				<p>Memory works in three stages: encoding, storage, and retrieval.</p>
				<p>Working memory is small. Most estimates put it near four items, not seven.</p>
				<p>Spaced practice beats cramming because each recall attempt strengthens the trace.</p>
			</div>
			<CollaborationCursor
				name="Teddy"
				className="top-22 left-33 text-sky-600"
				labelClassName="bg-sky-600"
				pointerClassName="-rotate-12"
			/>
			<CollaborationCursor
				name="Visu"
				className="right-10 bottom-12 text-emerald-600 [animation-delay:700ms]"
				labelClassName="bg-emerald-600"
				pointerClassName="rotate-6"
			/>
			<CollaborationCursor
				name="Maria"
				className="bottom-5 left-11 text-fuchsia-600 [animation-delay:1400ms]"
				labelClassName="bg-fuchsia-600"
				pointerClassName="rotate-18"
			/>
			<div
				ref={userCursorRef}
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute top-0 left-0 z-20 flex items-start gap-1 text-orange-600 opacity-0 transition-opacity duration-200 ease-out",
					userCursorVisible && "opacity-100",
				)}
			>
				<MousePointer2
					className="size-6 -rotate-6 fill-current drop-shadow-sm"
					aria-hidden="true"
				/>
				<span className="mt-4 rounded-sm bg-orange-600 px-2 py-0.5 text-[0.65rem] font-medium text-white shadow-sm">
					You
				</span>
			</div>
		</div>
	);
}

function CollaborationCursor({
	className,
	labelClassName,
	name,
	pointerClassName,
}: {
	className: string;
	labelClassName: string;
	name: string;
	pointerClassName: string;
}) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"collaboration-cursor-float pointer-events-none absolute z-10 flex items-start gap-1 motion-reduce:animate-none",
				className,
			)}
		>
			<MousePointer2
				className={cn("size-5 fill-current drop-shadow-sm", pointerClassName)}
				aria-hidden="true"
			/>
			<span
				className={cn(
					"mt-3 rounded-sm px-2 py-0.5 text-[0.65rem] font-medium text-white shadow-sm",
					labelClassName,
				)}
			>
				{name}
			</span>
		</div>
	);
}
