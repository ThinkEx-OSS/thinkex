import { FilePen, MousePointer2 } from "lucide-react";
import { useState } from "react";

import { cn } from "#/lib/utils";

export function CollaborationVisual() {
	const [userCursor, setUserCursor] = useState<{ x: number; y: number } | null>(null);
	const [userCursorVisible, setUserCursorVisible] = useState(false);
	const userCursorBounds = {
		height: 38,
		padding: 4,
		width: 62,
	};

	return (
		<div
			className="relative h-full min-h-52 w-full max-w-xl cursor-none overflow-hidden p-1"
			onMouseMove={(event) => {
				const rect = event.currentTarget.getBoundingClientRect();
				setUserCursor({
					x: Math.min(
						Math.max(event.clientX - rect.left, userCursorBounds.padding),
						rect.width - userCursorBounds.width,
					),
					y: Math.min(
						Math.max(event.clientY - rect.top, userCursorBounds.padding),
						rect.height - userCursorBounds.height,
					),
				});
				setUserCursorVisible(true);
			}}
			onMouseLeave={() => setUserCursorVisible(false)}
		>
			<div className="flex items-center gap-2 border-border/60 border-b pb-3">
				<FilePen className="size-5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
				<div className="text-base font-medium text-muted-foreground">Shared research notes</div>
				<div className="ml-auto flex -space-x-2">
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
			<div className="space-y-3 pt-4 text-sm leading-6 text-muted-foreground/85">
				<p>
					Prime editing depends on guide RNA design, repair pathway bias, and delivery constraints.
				</p>
				<p>Add comparison notes for efficiency across cell types before the methods section.</p>
				<p>
					Use the paper table as the source of truth, then summarize the tradeoffs in plain English.
				</p>
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
			{userCursor ? (
				<div
					className={cn(
						"pointer-events-none absolute z-20 flex items-start gap-1 text-orange-600 opacity-0 transition-opacity duration-200 ease-out",
						userCursorVisible && "opacity-100",
					)}
					style={{ left: userCursor.x, top: userCursor.y }}
				>
					<MousePointer2
						className="size-6 -rotate-6 fill-current drop-shadow-sm"
						aria-hidden="true"
					/>
					<span className="mt-4 rounded-sm bg-orange-600 px-2 py-0.5 text-[0.65rem] font-medium text-white shadow-sm">
						You
					</span>
				</div>
			) : null}
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
			className={cn(
				"collaboration-cursor-float pointer-events-none absolute z-10 flex items-start gap-1",
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
