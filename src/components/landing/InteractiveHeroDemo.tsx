import {
	Bold,
	Camera,
	Download,
	Folder,
	FolderOpen,
	Italic,
	List,
	MessageSquare,
	Microscope,
	Plus,
	RotateCcw,
	Search,
	Shapes,
	Share2,
	Shuffle,
	ChevronRight,
	X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import ThinkExLogo from "#/components/ThinkExLogo";
import { InteractiveHeroAiPanel } from "#/components/landing/InteractiveHeroAiPanel";
import {
	DemoSelectionButton,
	DemoTabDivider,
	DemoTabShell,
	DemoToolbarIconButton,
	DemoToolbarTextButton,
} from "#/components/landing/InteractiveHeroChrome";
import { CELL_CYCLE_WIDGET_HTML } from "#/components/landing/cell-cycle-widget";
import { FlashcardSurface, QuizSurface } from "#/components/landing/InteractiveHeroStudySurfaces";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import { workspaceColors } from "#/features/workspaces/model/workspace-colors";
import { cn } from "#/lib/utils";

const itemGridClass =
	"grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] sm:gap-4";
const itemCardClass =
	"workspace-item-card group/item relative flex min-h-20 cursor-pointer flex-row gap-0 overflow-hidden rounded-xl border bg-card py-0 transition-[background-color,box-shadow] hover:bg-secondary active:cursor-grabbing sm:h-44 sm:flex-col";
const itemPreviewClass =
	"pointer-events-none relative z-10 w-14 shrink-0 overflow-hidden bg-muted sm:min-h-20 sm:w-auto sm:flex-1";
const landingWidgetDocument = `<!doctype html><html><head><meta charset="utf-8"><style>
:root{color-scheme:light;--background:#fff;--foreground:#171717;--card:#fff;--muted:#f1f1f1;--muted-foreground:#737373;--border:#dedede;--primary:#2563eb;--destructive:#dc2626;--chart-1:#3b82f6;--chart-2:#1d4ed8;--chart-3:#059669;--chart-4:#a16207;--radius:.625rem;--font-sans:ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-sans)}button{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}.tx-stack{width:100%}.tx-muted{color:var(--muted-foreground)}[role=tablist]{display:grid;grid-template-columns:repeat(4,1fr);padding:4px;border-radius:12px;background:var(--muted)}[role=tab]{padding:8px 10px;border-radius:9px;color:var(--muted-foreground);font-weight:600}[role=tab][aria-selected=true]{background:var(--background);color:var(--foreground);box-shadow:0 1px 3px #0002}@media(prefers-color-scheme:dark){:root{color-scheme:dark;--background:#090909;--foreground:#fafafa;--card:#171717;--muted:#202020;--muted-foreground:#a3a3a3;--border:#303030;--primary:#60a5fa;--destructive:#ef4444;--chart-1:#60a5fa;--chart-2:#2563eb;--chart-3:#10b981;--chart-4:#a16207}}
</style></head><body>${CELL_CYCLE_WIDGET_HTML}</body></html>`;

type FolderTabId = "courseFolder" | "guidesFolder";
type PdfTabId = "source" | "dnaRepairSource" | "cellSignalingSource";
type TabId = "workspace" | "quiz" | "flashcards" | "notes" | "courseDoc" | PdfTabId | FolderTabId;

interface DemoTabSlot {
	readonly id: string;
	readonly view: TabId;
	readonly parentView?: TabId;
}

interface TabDefinition {
	readonly id: TabId;
	readonly title: string;
	readonly icon: LucideIcon;
	readonly iconClassName: string;
}

const CELL_BIOLOGY_PDF = createDemoItem(
	"cell-biology",
	"file",
	"Cell Biology — Mitosis.pdf",
	null,
	{ assetKind: "pdf" },
);
const DNA_REPAIR_PDF = createDemoItem(
	"dna-repair",
	"file",
	"DNA Repair.pdf",
	null,
	{ assetKind: "pdf" },
	"course-materials",
);
const CELL_SIGNALING_PDF = createDemoItem(
	"cell-signaling",
	"file",
	"Cellular Signaling.pdf",
	null,
	{ assetKind: "pdf" },
	"course-materials",
);
const CELL_CYCLE_NOTES = createDemoItem("cell-cycle-notes", "document", "Cell Cycle Notes", null, {
	previewText:
		"Cell Cycle Notes\nCyclins activate CDKs and move the cell through G1, S, G2, and M phase.\n\nCell cycle checkpoints\n• G1 checks cell size, nutrients, and DNA damage.\n• G2 confirms DNA replication is complete.\n• The M checkpoint confirms chromosomes are attached to spindle fibers.",
});
const LECTURE_NOTES = createDemoItem(
	"lecture-notes",
	"document",
	"Lecture Notes",
	null,
	{
		previewText: "Week 6\nInterphase, mitosis, cytokinesis, and cell-cycle checkpoints.",
	},
	"course-materials",
);
const UNIT_FLASHCARDS = createDemoItem("unit-2-flashcards", "flashcard", "Unit 2 Flashcards");
const MIDTERM_QUIZ = createDemoItem("midterm-quiz", "quiz", "Midterm Quiz");

const cellBiologyDisplay = getWorkspaceItemDisplay(CELL_BIOLOGY_PDF);
const dnaRepairDisplay = getWorkspaceItemDisplay(DNA_REPAIR_PDF);
const cellSignalingDisplay = getWorkspaceItemDisplay(CELL_SIGNALING_PDF);
const notesDisplay = getWorkspaceItemDisplay(CELL_CYCLE_NOTES);
const lectureNotesDisplay = getWorkspaceItemDisplay(LECTURE_NOTES);
const flashcardsDisplay = getWorkspaceItemDisplay(UNIT_FLASHCARDS);
const quizDisplay = getWorkspaceItemDisplay(MIDTERM_QUIZ);
const PDF_SOURCES: Readonly<
	Record<
		PdfTabId,
		{
			readonly item: WorkspaceItem;
			readonly thumbnailSrc: string;
			readonly thumbnailAlt: string;
		}
	>
> = {
	source: {
		item: CELL_BIOLOGY_PDF,
		thumbnailSrc: "/landing-hero/cell-cycle-textbook-page.webp",
		thumbnailAlt: "A textbook page showing the stages of mitosis",
	},
	dnaRepairSource: {
		item: DNA_REPAIR_PDF,
		thumbnailSrc: "/landing-hero/dna-repair-textbook-page.webp",
		thumbnailAlt: "A textbook page about DNA repair",
	},
	cellSignalingSource: {
		item: CELL_SIGNALING_PDF,
		thumbnailSrc: "/landing-hero/cell-signaling-textbook-page.webp",
		thumbnailAlt: "A textbook page about cellular signaling",
	},
};

const TABS: Readonly<Record<TabId, TabDefinition>> = {
	workspace: {
		id: "workspace",
		title: "Biology Lab",
		icon: Microscope,
		iconClassName: "text-cyan-700 dark:text-cyan-400",
	},
	quiz: {
		id: "quiz",
		title: "Midterm Quiz",
		icon: quizDisplay.Icon,
		iconClassName: quizDisplay.iconClassName,
	},
	flashcards: {
		id: "flashcards",
		title: "Unit 2 Flashcards",
		icon: flashcardsDisplay.Icon,
		iconClassName: flashcardsDisplay.iconClassName,
	},
	notes: {
		id: "notes",
		title: "Cell Cycle Notes",
		icon: notesDisplay.Icon,
		iconClassName: notesDisplay.iconClassName,
	},
	source: {
		id: "source",
		title: CELL_BIOLOGY_PDF.name,
		icon: cellBiologyDisplay.Icon,
		iconClassName: cellBiologyDisplay.iconClassName,
	},
	dnaRepairSource: {
		id: "dnaRepairSource",
		title: "DNA Repair.pdf",
		icon: dnaRepairDisplay.Icon,
		iconClassName: dnaRepairDisplay.iconClassName,
	},
	cellSignalingSource: {
		id: "cellSignalingSource",
		title: "Cellular Signaling.pdf",
		icon: cellSignalingDisplay.Icon,
		iconClassName: cellSignalingDisplay.iconClassName,
	},
	courseDoc: {
		id: "courseDoc",
		title: "Lecture Notes",
		icon: lectureNotesDisplay.Icon,
		iconClassName: lectureNotesDisplay.iconClassName,
	},
	courseFolder: {
		id: "courseFolder",
		title: "Course Materials",
		icon: Folder,
		iconClassName: workspaceColors.blue.iconClassName,
	},
	guidesFolder: {
		id: "guidesFolder",
		title: "Study Guides",
		icon: Folder,
		iconClassName: workspaceColors.cyan.iconClassName,
	},
};

const COLLABORATORS = [
	{
		initials: "M",
		name: "Maya",
		activity: "Editing Cell Cycle Notes",
		className: "bg-violet-600 text-white",
	},
	{
		initials: "N",
		name: "Noah",
		activity: `Reading ${CELL_BIOLOGY_PDF.name}`,
		className: "bg-sky-600 text-white",
	},
] as const;

interface DemoItem {
	readonly item: WorkspaceItem;
	readonly tab: TabId;
	readonly thumbnailSrc?: string;
	readonly thumbnailAlt?: string;
}

const ITEMS: readonly DemoItem[] = [
	{
		tab: "courseFolder",
		item: createDemoItem("course-materials", "folder", "Course Materials", "blue"),
	},
	{
		tab: "guidesFolder",
		item: createDemoItem("study-guides", "folder", "Study Guides", "cyan"),
	},
	{
		tab: "source",
		thumbnailSrc: PDF_SOURCES.source.thumbnailSrc,
		thumbnailAlt: PDF_SOURCES.source.thumbnailAlt,
		item: CELL_BIOLOGY_PDF,
	},
	{
		tab: "notes",
		item: CELL_CYCLE_NOTES,
	},
	{
		tab: "flashcards",
		item: UNIT_FLASHCARDS,
	},
	{
		tab: "quiz",
		item: MIDTERM_QUIZ,
	},
];

const FOLDER_ITEMS: Readonly<Record<FolderTabId, readonly DemoItem[]>> = {
	courseFolder: [
		{
			tab: "dnaRepairSource",
			thumbnailSrc: PDF_SOURCES.dnaRepairSource.thumbnailSrc,
			thumbnailAlt: PDF_SOURCES.dnaRepairSource.thumbnailAlt,
			item: DNA_REPAIR_PDF,
		},
		{
			tab: "cellSignalingSource",
			thumbnailSrc: PDF_SOURCES.cellSignalingSource.thumbnailSrc,
			thumbnailAlt: PDF_SOURCES.cellSignalingSource.thumbnailAlt,
			item: CELL_SIGNALING_PDF,
		},
		{
			tab: "courseDoc",
			item: LECTURE_NOTES,
		},
	],
	guidesFolder: [],
};
const DEMO_FOLDER_META: Readonly<Record<string, string>> = {
	"course-materials": "3 items",
	"study-guides": "Empty",
};
const DEMO_RECENCY_LABELS: Readonly<Record<string, string>> = {
	"cell-biology": "Edited 2:14 PM",
	"cell-cycle-notes": "Edited 1 day ago",
	"unit-2-flashcards": "Created 2 days ago",
	"midterm-quiz": "Edited Aug 19",
	"dna-repair": "Edited 11:40 AM",
	"cell-signaling": "Created 3 days ago",
	"lecture-notes": "Edited 1 day ago",
};
const DEMO_WORKSPACE_ITEMS = [
	...ITEMS.map((entry) => entry.item),
	...Object.values(FOLDER_ITEMS).flatMap((entries) => entries.map((entry) => entry.item)),
];
const DEMO_ITEM_BY_TAB = new Map<TabId, WorkspaceItem>(
	[...ITEMS, ...Object.values(FOLDER_ITEMS).flatMap((entries) => entries)].map(({ item, tab }) => [
		tab,
		item,
	]),
);

function createDemoItem(
	id: string,
	type: WorkspaceItem["type"],
	name: string,
	color: WorkspaceItem["color"] = null,
	metadataJson: WorkspaceItem["metadataJson"] = {},
	parentId: string | null = null,
): WorkspaceItem {
	return {
		id,
		workspaceId: "landing-biology-lab",
		parentId,
		type,
		name,
		refKey: `landing-${id}`,
		color,
		metadataJson,
		sortOrder: 0,
		createdAt: "2026-08-21T14:00:00.000Z",
		updatedAt: "2026-08-22T13:45:00.000Z",
	};
}

function CollaboratorPresence() {
	return (
		<div className="group/presence relative">
			<button
				type="button"
				className="flex h-7 cursor-default items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label="22 people collaborating"
			>
				{COLLABORATORS.map((person) => (
					<span
						key={person.name}
						className={cn(
							"grid size-6 place-items-center rounded-full text-[10px] font-medium",
							person.className,
						)}
					>
						{person.initials}
					</span>
				))}
				<span className="grid size-6 place-items-center rounded-full border border-border bg-card text-[8px] font-medium text-foreground shadow-xs">
					+20
				</span>
			</button>
			<div className="pointer-events-none absolute top-full right-0 z-40 mt-2 w-64 rounded-md border bg-popover p-2 text-popover-foreground opacity-0 shadow-md transition-opacity group-focus-within/presence:pointer-events-auto group-focus-within/presence:opacity-100 group-hover/presence:pointer-events-auto group-hover/presence:opacity-100">
				<p className="px-2 pt-1 pb-1.5 text-xs font-medium">22 people working here</p>
				{COLLABORATORS.map((person) => (
					<div key={person.name} className="flex items-center gap-2 rounded-sm px-2 py-1.5">
						<span
							className={cn(
								"grid size-6 place-items-center rounded-full text-[10px] font-medium",
								person.className,
							)}
						>
							{person.initials}
						</span>
						<div className="min-w-0">
							<p className="truncate text-xs font-medium">{person.name}</p>
							<p className="truncate text-[10px] text-muted-foreground">{person.activity}</p>
						</div>
					</div>
				))}
				<p className="px-2 py-1.5 text-xs text-muted-foreground">20 more collaborators</p>
			</div>
		</div>
	);
}

function DemoTopBar({
	activeTabId,
	tabs,
	onActivate,
	onClose,
	onCreateRootTab,
	onOpenChat,
	onPreviewGate,
}: {
	readonly activeTabId: string;
	readonly tabs: readonly DemoTabSlot[];
	readonly onActivate: (tabId: string) => void;
	readonly onClose: (tabId: string) => void;
	readonly onCreateRootTab: () => void;
	readonly onOpenChat: () => void;
	readonly onPreviewGate: () => void;
}) {
	const lastTab = tabs.at(-1);

	return (
		<header className="flex h-12 shrink-0 items-stretch bg-muted px-3">
			<div className="flex min-w-0 flex-1 items-stretch gap-3">
				<div className="flex shrink-0 items-center pr-1">
					<ThinkExLogo size={22} presentation />
				</div>
				<nav className="flex min-w-0 flex-1 items-center gap-1" aria-label="Open workspace tabs">
					<div
						className="flex min-w-0 max-w-full items-center gap-1 overflow-visible"
						style={{ width: "calc(100% - 2.5rem)", maxWidth: `calc(${tabs.length} * 10.5rem)` }}
					>
						{tabs.map((slot, index) => {
							const tab = TABS[slot.view];
							const isActive = activeTabId === slot.id;
							return (
								<div
									key={slot.id}
									className="relative flex min-w-0 max-w-64 flex-1 basis-0 items-center"
								>
									{index > 0 && (
										<DemoTabDivider
											className="pointer-events-none absolute top-1/2 left-0 -translate-x-0.5 -translate-y-1/2"
											visible={!isActive && activeTabId !== tabs[index - 1]?.id}
										/>
									)}
									<DemoTabShell
										title={tab.title}
										TabIcon={tab.icon}
										iconClassName={tab.iconClassName}
										active={isActive}
										showClose={tabs.length > 1}
										onActivate={() => onActivate(slot.id)}
										onClose={() => onClose(slot.id)}
									/>
								</div>
							);
						})}
					</div>
					<div className="relative flex shrink-0 items-center gap-1">
						<DemoTabDivider visible={lastTab?.id !== activeTabId} />
						<DemoToolbarIconButton
							className="shrink-0"
							aria-label="Open new workspace tab"
							onClick={onCreateRootTab}
						>
							<Plus />
						</DemoToolbarIconButton>
					</div>
				</nav>
				<div className="flex shrink-0 items-center gap-2">
					<div className="hidden lg:block">
						<CollaboratorPresence />
					</div>
					<div className="hidden sm:block">
						<DemoToolbarIconButton aria-label="Share workspace" onClick={onPreviewGate}>
							<Share2 />
						</DemoToolbarIconButton>
					</div>
					<span className="hidden size-6 place-items-center rounded-full bg-blue-700 text-[10px] font-medium text-white sm:grid">
						U
					</span>
					<DemoToolbarIconButton
						onClick={onOpenChat}
						aria-label="Open AI chat"
						className="lg:hidden"
					>
						<MessageSquare />
					</DemoToolbarIconButton>
				</div>
			</div>
		</header>
	);
}

function DemoContextBar({
	activeTab,
	parentView,
	openTab,
	onClose,
	onPreviewGate,
}: {
	readonly activeTab: TabId;
	readonly parentView?: TabId;
	readonly openTab: (tab: TabId) => void;
	readonly onClose: () => void;
	readonly onPreviewGate: () => void;
}) {
	const isRoot = activeTab === "workspace";
	const isFolder = isFolderTab(activeTab);
	const folderParent = parentView && isFolderTab(parentView) ? TABS[parentView] : undefined;
	const FolderParentIcon = folderParent?.icon;
	const activeItem = TABS[activeTab];
	const ActiveItemIcon = activeItem.icon;

	return (
		<div className="relative z-10 flex h-11 shrink-0 items-center gap-3 bg-background px-4 text-sm">
			<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
				<button
					type="button"
					onClick={() => openTab("workspace")}
					className={cn(
						"flex min-w-0 items-center gap-1.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground",
						isRoot && "font-medium text-foreground",
					)}
				>
					<Microscope className="size-4 shrink-0 text-cyan-700 dark:text-cyan-400" />
					<span className="truncate">Biology Lab</span>
				</button>
				{folderParent && FolderParentIcon && parentView ? (
					<>
						<ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
						<button
							type="button"
							onClick={() => openTab(parentView)}
							className="flex min-w-0 items-center gap-1.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							<FolderParentIcon className={cn("size-4 shrink-0", folderParent.iconClassName)} />
							<span className="truncate">{folderParent.title}</span>
						</button>
					</>
				) : null}
				{!isRoot && (
					<>
						<ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
						<span className="flex min-w-0 items-center gap-1.5 font-medium">
							<ActiveItemIcon className={cn("size-4 shrink-0", activeItem.iconClassName)} />
							<span className="truncate">{activeItem.title}</span>
						</span>
					</>
				)}
			</div>
			<div className="flex shrink-0 items-center gap-1">
				{isRoot || isFolder ? (
					<>
						<DemoToolbarIconButton
							aria-label="Search workspace"
							className="sm:hidden"
							onClick={onPreviewGate}
						>
							<Search />
						</DemoToolbarIconButton>
						<DemoToolbarTextButton className="hidden sm:inline-flex" onClick={onPreviewGate}>
							<Search /> Search
						</DemoToolbarTextButton>
						<DemoToolbarIconButton
							aria-label="Create workspace item"
							className="sm:hidden"
							onClick={onPreviewGate}
						>
							<Plus />
						</DemoToolbarIconButton>
						<DemoToolbarTextButton className="hidden sm:inline-flex" onClick={onPreviewGate}>
							<Plus /> New
						</DemoToolbarTextButton>
					</>
				) : (
					<DemoItemToolbar activeTab={activeTab} onPreviewGate={onPreviewGate} />
				)}
				{!isRoot && (
					<DemoToolbarIconButton aria-label="Close item" onClick={onClose}>
						<X />
					</DemoToolbarIconButton>
				)}
			</div>
		</div>
	);
}

function DemoPdfToolbar({ onPreviewGate }: { readonly onPreviewGate: () => void }) {
	return (
		<>
			<DemoToolbarTextButton onClick={onPreviewGate}>
				<Camera />
				Capture
			</DemoToolbarTextButton>
			<DemoToolbarIconButton aria-label="Download file" onClick={onPreviewGate}>
				<Download />
			</DemoToolbarIconButton>
		</>
	);
}

function DemoItemToolbar({
	activeTab,
	onPreviewGate,
}: {
	readonly activeTab: TabId;
	readonly onPreviewGate: () => void;
}) {
	if (activeTab === "workspace" || isFolderTab(activeTab)) return null;

	if (isPdfTab(activeTab)) {
		return <DemoPdfToolbar onPreviewGate={onPreviewGate} />;
	}

	if (activeTab === "flashcards" || activeTab === "quiz") {
		return (
			<>
				<DemoToolbarTextButton onClick={onPreviewGate}>
					<List /> <span className="hidden sm:inline">All {activeTab}</span>
				</DemoToolbarTextButton>
				<DemoToolbarIconButton aria-label={`Shuffle ${activeTab}`} onClick={onPreviewGate}>
					<Shuffle />
				</DemoToolbarIconButton>
				<DemoToolbarIconButton aria-label={`Reset ${activeTab} progress`} onClick={onPreviewGate}>
					<RotateCcw />
				</DemoToolbarIconButton>
			</>
		);
	}

	return (
		<>
			<DemoToolbarIconButton aria-label="Bold" onClick={onPreviewGate}>
				<Bold />
			</DemoToolbarIconButton>
			<DemoToolbarIconButton aria-label="Italic" onClick={onPreviewGate}>
				<Italic />
			</DemoToolbarIconButton>
			<DemoToolbarIconButton aria-label="Bulleted list" onClick={onPreviewGate}>
				<List />
			</DemoToolbarIconButton>
		</>
	);
}

function DemoItemCard({
	isSelected,
	item: demoItem,
	openTab,
	onSelectionChange,
}: {
	readonly isSelected: boolean;
	readonly item: DemoItem;
	readonly openTab: (tab: TabId) => void;
	readonly onSelectionChange: (item: WorkspaceItem, selected: boolean) => void;
}) {
	const { item, tab, thumbnailSrc, thumbnailAlt } = demoItem;
	const itemDisplay = getWorkspaceItemDisplay(item);
	const ItemIcon = itemDisplay.Icon;
	const previewText =
		typeof item.metadataJson.previewText === "string" ? item.metadataJson.previewText : item.name;

	return (
		<article
			data-selected={isSelected ? "true" : undefined}
			className={cn(
				itemCardClass,
				"not-data-[selected=true]:hover:shadow-md not-data-[selected=true]:hover:ring-foreground/15 data-[selected=true]:ring-2 data-[selected=true]:ring-info",
			)}
		>
			<button
				type="button"
				onClick={() => openTab(tab)}
				aria-label={`Open ${item.name}`}
				className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			/>
			{thumbnailSrc ? (
				<div className={cn(itemPreviewClass, itemDisplay.surfaceClassName)}>
					<div className="absolute inset-0">
						<div className="flex size-full items-center justify-center sm:hidden">
							<ItemIcon
								className={cn("size-8 sm:size-10", itemDisplay.iconClassName)}
								strokeWidth={1.75}
							/>
						</div>
						<img
							src={thumbnailSrc}
							alt={thumbnailAlt ?? "Textbook page preview"}
							width={800}
							height={1036}
							className="hidden size-full object-cover object-top sm:block"
						/>
						<span className="absolute right-1 bottom-1 hidden rounded bg-black/65 px-1 py-0.5 text-[7px] leading-none text-white sm:block">
							VT · CC BY-NC-SA
						</span>
					</div>
				</div>
			) : tab === "flashcards" || tab === "quiz" ? (
				<DemoStudyItemPreview item={item} kind={tab} />
			) : (
				<div className={cn(itemPreviewClass, itemDisplay.surfaceClassName)}>
					<div className="flex size-full items-center justify-center sm:hidden">
						<ItemIcon className={cn("size-8", itemDisplay.iconClassName)} strokeWidth={1.75} />
					</div>
					{item.type === "document" ? (
						<div className="hidden size-full overflow-hidden p-3 sm:block">
							<p className="text-[11px] leading-[1.45] text-muted-foreground/70 whitespace-pre-line break-words line-clamp-5">
								{previewText}
							</p>
						</div>
					) : (
						<div className="hidden size-full items-center justify-center sm:flex">
							<ItemIcon className={cn("size-10", itemDisplay.iconClassName)} strokeWidth={1.75} />
						</div>
					)}
				</div>
			)}
			<div className="pointer-events-none absolute inset-x-0 top-0 z-20 hidden sm:block">
				<div className="relative z-10 flex h-10 items-center justify-between px-2">
					<DemoSelectionButton
						itemName={item.name}
						selected={isSelected}
						onClick={() => onSelectionChange(item, !isSelected)}
					/>
				</div>
			</div>
			<div className="pointer-events-none relative z-10 grid min-w-0 flex-1 auto-rows-min items-start gap-1 self-center py-2 pr-3 pl-3 sm:flex-none sm:shrink-0 sm:self-auto sm:px-3">
				<p className="truncate font-heading text-base leading-normal font-medium">{item.name}</p>
				{item.type === "folder" ? (
					<p className="text-xs text-muted-foreground">{DEMO_FOLDER_META[item.id]}</p>
				) : (
					<div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
						<div className="min-w-0 flex-1">
							<span className="flex min-w-0 items-center sm:gap-1.5">
								<ItemIcon
									className={cn("hidden size-3.5 shrink-0 sm:block", itemDisplay.iconClassName)}
									strokeWidth={1.75}
								/>
								<span className="truncate">{itemDisplay.label}</span>
							</span>
						</div>
						<span aria-hidden="true" className="h-3 w-px shrink-0 bg-border/70" />
						<span className="shrink-0 whitespace-nowrap">{DEMO_RECENCY_LABELS[item.id]}</span>
					</div>
				)}
			</div>
		</article>
	);
}

function DemoStudyItemPreview({
	item,
	kind,
}: {
	readonly item: WorkspaceItem;
	readonly kind: "flashcards" | "quiz";
}) {
	const display = getWorkspaceItemDisplay(item);
	const ItemIcon = display.Icon;

	return (
		<div className={cn(itemPreviewClass, display.surfaceClassName)}>
			<div className="absolute inset-0">
				<div className="flex size-full items-center justify-center sm:hidden">
					<ItemIcon className={cn("size-8 sm:size-10", display.iconClassName)} strokeWidth={1.75} />
				</div>
				<div className="hidden size-full p-3 sm:block">
					{kind === "flashcards" ? (
						<div className="flex size-full flex-col rounded-lg border border-foreground/10 bg-background/60 p-3 shadow-sm">
							<span className="block text-[8px] font-semibold tracking-widest text-muted-foreground uppercase">
								Front
							</span>
							<p className="mt-2 line-clamp-2 text-left text-[11px] leading-4 font-medium">
								During which phase are duplicated chromosomes pulled to opposite ends of the cell?
							</p>
						</div>
					) : (
						<div className="flex size-full flex-col rounded-lg border border-foreground/10 bg-background/60 p-3 shadow-sm">
							<span className="block text-[8px] font-semibold tracking-widest text-muted-foreground uppercase">
								Question 1
							</span>
							<p className="mt-2 line-clamp-2 text-left text-[11px] leading-4 font-medium">
								Where does cellular respiration primarily occur?
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function WorkspaceGrid({
	openTab,
	selectedItemIds,
	onSelectionChange,
}: {
	readonly openTab: (tab: TabId) => void;
	readonly selectedItemIds: ReadonlySet<string>;
	readonly onSelectionChange: (item: WorkspaceItem, selected: boolean) => void;
}) {
	const folders = ITEMS.filter(({ item }) => item.type === "folder");
	const nonFolderItems = ITEMS.filter(({ item }) => item.type !== "folder");

	return (
		<div className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-3">
			<div className={itemGridClass}>
				{folders.map((item) => (
					<DemoItemCard
						key={item.item.id}
						isSelected={selectedItemIds.has(item.item.id)}
						item={item}
						openTab={openTab}
						onSelectionChange={onSelectionChange}
					/>
				))}
			</div>
			<div className={itemGridClass}>
				{nonFolderItems.map((item) => (
					<DemoItemCard
						key={item.item.id}
						isSelected={selectedItemIds.has(item.item.id)}
						item={item}
						openTab={openTab}
						onSelectionChange={onSelectionChange}
					/>
				))}
			</div>
		</div>
	);
}

function isFolderTab(tab: TabId): tab is FolderTabId {
	return tab === "courseFolder" || tab === "guidesFolder";
}

function isPdfTab(tab: TabId): tab is PdfTabId {
	return tab === "source" || tab === "dnaRepairSource" || tab === "cellSignalingSource";
}

function FolderSurface({
	folderTab,
	openTab,
	selectedItemIds,
	onSelectionChange,
}: {
	readonly folderTab: FolderTabId;
	readonly openTab: (tab: TabId) => void;
	readonly selectedItemIds: ReadonlySet<string>;
	readonly onSelectionChange: (item: WorkspaceItem, selected: boolean) => void;
}) {
	const items = FOLDER_ITEMS[folderTab];

	if (items.length === 0) {
		return (
			<div className="flex h-full px-4 py-3">
				<div className="flex w-full flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-muted/20 p-12 text-center text-balance">
					<span className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
						<FolderOpen className="size-6" aria-hidden="true" />
					</span>
					<div className="flex max-w-sm flex-col items-center gap-2">
						<p className="font-heading text-lg font-medium tracking-tight">This folder is empty</p>
						<p className="text-muted-foreground text-sm/relaxed">
							Create your own workspace and add your first source.
						</p>
					</div>
					<Button nativeButton={false} render={<Link to="/login" />} size="sm">
						Get started
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto px-4 py-3">
			<div className={itemGridClass}>
				{items.map((item) => (
					<DemoItemCard
						key={item.item.id}
						isSelected={selectedItemIds.has(item.item.id)}
						item={item}
						openTab={openTab}
						onSelectionChange={onSelectionChange}
					/>
				))}
			</div>
		</div>
	);
}

function CourseDocSurface() {
	return (
		<section className="relative flex h-full min-h-0 flex-col bg-background">
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div
					className="workspace-document-prose min-h-full py-4 outline-none"
					contentEditable
					suppressContentEditableWarning
					aria-label="Editable Lecture Notes document"
				>
					<h1>Lecture Notes</h1>
					<p>Week 6 — Interphase, mitosis, cytokinesis, and cell-cycle checkpoints.</p>
					<h2>Interphase</h2>
					<ul>
						<li>G1: the cell grows and checks that conditions are right to copy DNA.</li>
						<li>S: DNA is replicated.</li>
						<li>G2: the cell prepares for mitosis and checks that replication finished.</li>
					</ul>
					<h2>Mitosis and cytokinesis</h2>
					<p>
						Mitosis separates sister chromatids. Cytokinesis then splits the cytoplasm so each
						daughter cell gets a complete nucleus.
					</p>
				</div>
			</div>
		</section>
	);
}

function NotesSurface() {
	return (
		<section className="relative flex h-full min-h-0 flex-col bg-background">
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div
					className="workspace-document-prose min-h-full py-4 outline-none"
					contentEditable
					suppressContentEditableWarning
					aria-label="Editable Cell Cycle Notes document"
				>
					<h1>Cell Cycle Notes</h1>
					<p>
						Cyclins activate cyclin-dependent kinases (CDKs), moving the cell through G1, S, G2, and
						M phase.
					</p>
					<div
						className="workspace-document-widget overflow-hidden rounded-lg border"
						contentEditable={false}
					>
						<div className="workspace-document-widget-header flex min-h-10 items-center border-b px-3 text-xs text-muted-foreground">
							<div className="flex min-w-0 items-center gap-2">
								<Shapes className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
								<span className="font-medium text-foreground">Interactive widget</span>
								<span aria-hidden="true">·</span>
								<span className="truncate">Cell cycle checkpoint explorer</span>
							</div>
						</div>
						<iframe
							title="Cell cycle checkpoint explorer widget"
							sandbox="allow-scripts"
							srcDoc={landingWidgetDocument}
							className="h-[34rem] w-full border-0 bg-background sm:h-[22rem]"
						/>
					</div>
					<h2>Cell cycle checkpoints</h2>
					<ul>
						<li>G1 checks cell size, nutrients, and DNA damage.</li>
						<li>G2 confirms DNA replication is complete.</li>
						<li>The M checkpoint confirms chromosomes are attached to spindle fibers.</li>
					</ul>
					<p>If DNA is damaged, checkpoint proteins pause the cycle before division continues.</p>
				</div>
			</div>
		</section>
	);
}

function SourceSurface({ source }: { readonly source: (typeof PDF_SOURCES)[PdfTabId] }) {
	return (
		<div className="h-full overflow-y-auto bg-muted/50 p-3 sm:p-5">
			<figure className="mx-auto max-w-xl">
				<img
					src={source.thumbnailSrc}
					alt={source.thumbnailAlt}
					width={800}
					height={1036}
					className="h-auto w-full bg-white shadow-sm"
				/>
				<figcaption className="mt-2 text-center text-[9px] text-muted-foreground">
					Cell Biology, Genetics, and Biochemistry · Virginia Tech · CC BY-NC-SA 4.0
				</figcaption>
			</figure>
		</div>
	);
}

function ActiveSurface({
	activeTab,
	openTab,
	selectedItemIds,
	onSelectionChange,
}: {
	readonly activeTab: TabId;
	readonly openTab: (tab: TabId) => void;
	readonly selectedItemIds: ReadonlySet<string>;
	readonly onSelectionChange: (item: WorkspaceItem, selected: boolean) => void;
}) {
	if (activeTab === "workspace") {
		return (
			<WorkspaceGrid
				openTab={openTab}
				selectedItemIds={selectedItemIds}
				onSelectionChange={onSelectionChange}
			/>
		);
	}
	if (isFolderTab(activeTab)) {
		return (
			<FolderSurface
				folderTab={activeTab}
				openTab={openTab}
				selectedItemIds={selectedItemIds}
				onSelectionChange={onSelectionChange}
			/>
		);
	}
	if (activeTab === "quiz") return <QuizSurface />;
	if (activeTab === "flashcards") return <FlashcardSurface />;
	if (activeTab === "notes") return <NotesSurface />;
	if (activeTab === "courseDoc") return <CourseDocSurface />;
	if (isPdfTab(activeTab)) return <SourceSurface source={PDF_SOURCES[activeTab]} />;
	return null;
}

/** A controlled landing-page demo built from the same visual primitives as the real workspace. */
export function InteractiveHeroDemo() {
	const [tabs, setTabs] = useState<readonly DemoTabSlot[]>([
		{ id: "tab-1", view: "workspace" },
		{ id: "tab-2", view: "source", parentView: "workspace" },
		{ id: "tab-3", view: "quiz", parentView: "workspace" },
	]);
	const [activeTabId, setActiveTabId] = useState("tab-1");
	const [mobileChatOpen, setMobileChatOpen] = useState(false);
	const [previewGateOpen, setPreviewGateOpen] = useState(false);
	const [selectedItemIds, setSelectedItemIds] = useState<ReadonlySet<string>>(() => new Set());
	const activeSlot = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
	const activeTab = activeSlot?.view ?? "workspace";
	const activeContextItem = DEMO_ITEM_BY_TAB.get(activeTab);
	const contextItems = [
		...(activeContextItem ? [activeContextItem] : []),
		...DEMO_WORKSPACE_ITEMS.filter(
			(item) => item.id !== activeContextItem?.id && selectedItemIds.has(item.id),
		),
	];
	const setItemSelected = (item: WorkspaceItem, selected: boolean) => {
		setSelectedItemIds((current) => {
			const next = new Set(current);
			if (selected) next.add(item.id);
			else next.delete(item.id);
			return next;
		});
	};
	const removeContextItem = (itemId: string) => {
		setSelectedItemIds((current) => {
			const next = new Set(current);
			next.delete(itemId);
			return next;
		});
	};
	const openTab = (view: TabId) => {
		setTabs((current) =>
			current.map((tab) =>
				tab.id === activeTabId
					? { ...tab, view, parentView: view === "workspace" ? undefined : activeTab }
					: tab,
			),
		);
	};
	const closeTab = (tabId: string) => {
		if (tabs.length <= 1) return;
		const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
		const nextTabs = tabs.filter((tab) => tab.id !== tabId);
		setTabs(nextTabs);
		if (activeTabId === tabId) {
			setActiveTabId(nextTabs[Math.max(0, closingIndex - 1)]?.id ?? nextTabs[0]?.id ?? "tab-1");
		}
	};
	const createRootTab = () => {
		const tab: DemoTabSlot = { id: crypto.randomUUID(), view: "workspace" };
		setTabs((current) => [...current, tab]);
		setActiveTabId(tab.id);
	};
	const closeItem = () => openTab(activeSlot?.parentView ?? "workspace");
	const openChat = () => setMobileChatOpen(true);

	return (
		<div className="relative flex h-[40rem] overflow-hidden bg-background sm:h-[42rem] lg:h-[44rem] xl:h-[46rem] dark:bg-black">
			<div className="flex min-w-0 flex-1 flex-col">
				<DemoTopBar
					activeTabId={activeTabId}
					tabs={tabs}
					onActivate={setActiveTabId}
					onClose={closeTab}
					onCreateRootTab={createRootTab}
					onOpenChat={openChat}
					onPreviewGate={() => setPreviewGateOpen(true)}
				/>
				<DemoContextBar
					activeTab={activeTab}
					parentView={activeSlot?.parentView}
					openTab={openTab}
					onClose={closeItem}
					onPreviewGate={() => setPreviewGateOpen(true)}
				/>
				<div className="min-h-0 flex-1">
					<ActiveSurface
						activeTab={activeTab}
						openTab={openTab}
						selectedItemIds={selectedItemIds}
						onSelectionChange={setItemSelected}
					/>
				</div>
			</div>
			<aside className="hidden h-full w-2/5 shrink-0 border-l lg:block" aria-label="AI chat">
				<InteractiveHeroAiPanel
					contextItems={contextItems}
					selectedItemIds={selectedItemIds}
					notesItem={CELL_CYCLE_NOTES}
					sourceItem={CELL_BIOLOGY_PDF}
					onRemoveContext={removeContextItem}
					onOpenNotes={() => openTab("notes")}
					onOpenSource={() => openTab("source")}
					onPreviewGate={() => setPreviewGateOpen(true)}
				/>
			</aside>
			{mobileChatOpen && (
				<div className="absolute inset-0 z-30 bg-background lg:hidden">
					<InteractiveHeroAiPanel
						contextItems={contextItems}
						selectedItemIds={selectedItemIds}
						notesItem={CELL_CYCLE_NOTES}
						sourceItem={CELL_BIOLOGY_PDF}
						onRemoveContext={removeContextItem}
						onClose={() => setMobileChatOpen(false)}
						onPreviewGate={() => setPreviewGateOpen(true)}
						onOpenNotes={() => {
							openTab("notes");
							setMobileChatOpen(false);
						}}
						onOpenSource={() => {
							openTab("source");
							setMobileChatOpen(false);
						}}
					/>
				</div>
			)}
			<Dialog open={previewGateOpen} onOpenChange={setPreviewGateOpen}>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Continue in ThinkEx</DialogTitle>
						<DialogDescription>Start free and create your own workspace today.</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button nativeButton={false} render={<Link to="/login" />} className="w-full">
							Get started
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
