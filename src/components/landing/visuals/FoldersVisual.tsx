import { ChevronDown, ChevronRight, Landmark } from "lucide-react";

import { getWorkspaceItemTypeDisplay } from "#/features/workspaces/model/item-display";
import { getWorkspaceUploadFamily } from "#/features/workspaces/model/workspace-file";
import { workspaceColors } from "#/features/workspaces/model/workspace-colors";
import { cn } from "#/lib/utils";

type TreeRow = {
	id: string;
	label: string;
	depth: number;
	/** Item types come from the registry; files carry their upload kind instead. */
	type: "workspace" | "folder" | "document" | "flashcard" | "quiz" | "file";
	fileKind?: "pdf" | "image";
	open?: boolean;
};

/**
 * A sample of the sources the card to the left showed, now filed. Deliberately
 * not all of them: this is the tallest of the three panels, and every extra row
 * sets the height of the whole row of cards.
 */
const TREE: ReadonlyArray<TreeRow> = [
	{ id: "history", type: "workspace", label: "History 201", depth: 0, open: true },
	{ id: "readings", type: "folder", label: "Readings", depth: 1, open: true },
	{ id: "textbook", type: "file", fileKind: "pdf", label: "World History, Vol. 2", depth: 2 },
	{ id: "poster", type: "file", fileKind: "image", label: "ERP poster, 1950", depth: 2 },
	{ id: "lectures", type: "folder", label: "Lectures", depth: 1, open: true },
	{ id: "lecture", type: "file", fileKind: "pdf", label: "Lecture 9: The Cold War", depth: 2 },
	{ id: "essay", type: "document", label: "Marshall Plan essay", depth: 1 },
	{ id: "midterm", type: "quiz", label: "Midterm Quiz", depth: 1 },
];

/** A workspace tree, showing that everything nests and every type lives together. */
export function FoldersVisual() {
	return (
		<div className="flex w-full flex-col justify-center gap-0.5">
			{TREE.map((row) => {
				const { Icon, iconClassName } = resolveRowIcon(row);
				const isFolder = row.type === "folder" || row.type === "workspace";

				return (
					<div
						key={row.id}
						className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:bg-muted"
						style={{ paddingLeft: `${row.depth * 1.1 + 0.5}rem` }}
					>
						{isFolder ? (
							row.open ? (
								<ChevronDown
									className="size-3.5 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
							) : (
								<ChevronRight
									className="size-3.5 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
							)
						) : (
							<span className="size-3.5 shrink-0" />
						)}
						<Icon className={cn("size-4 shrink-0", iconClassName)} aria-hidden="true" />
						<span className="truncate text-foreground/85">{row.label}</span>
					</div>
				);
			})}
		</div>
	);
}

/**
 * Files get the icon their upload family carries, so a PDF and an image do not
 * both show a generic paperclip the way they would from the item registry alone.
 */
function resolveRowIcon(row: TreeRow) {
	// The History theme's own icon and colour, imported directly. Reading them
	// from the theme registry pulls 104 lucide components and a throwing
	// module-scope assert into the landing bundle to render one icon.
	if (row.type === "workspace") {
		return { Icon: Landmark, iconClassName: workspaceColors["indigo-bold"].iconClassName };
	}

	const display = getWorkspaceItemTypeDisplay(row.type);
	const iconClassName = workspaceColors[display.color].iconClassName;

	if (row.type === "file" && row.fileKind) {
		return { Icon: getWorkspaceUploadFamily(row.fileKind).icon, iconClassName };
	}

	return { Icon: display.icon, iconClassName };
}
