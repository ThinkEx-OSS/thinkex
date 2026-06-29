import { FileText, FolderOpen, Image } from "lucide-react";

import { Card, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty";
import { WorkspaceCardMetaRow } from "#/features/workspaces/components/workspace-card-meta-row";
import {
	workspaceItemCardBaseClass,
	workspaceItemDocumentPreviewPanelClass,
	workspaceItemDocumentPreviewTextClass,
	workspaceItemGridClass,
	workspaceItemPreviewContentLayerClass,
	workspaceItemPreviewIconClass,
	workspaceItemPreviewStageClass,
} from "#/features/workspaces/components/workspace-item-card-chrome";
import { workspaceColors } from "#/features/workspaces/model/workspace-colors";
import { cn } from "#/lib/utils";

const workspaceRootEmptyMediaIcons = [
	{
		Icon: FolderOpen,
		iconClassName: workspaceColors.amber.iconClassName,
		className: "translate-x-7 translate-y-4 rotate-[10deg]",
	},
	{
		Icon: FileText,
		iconClassName: workspaceColors.sky.iconClassName,
		className: "-translate-y-2",
	},
	{
		Icon: Image,
		iconClassName: workspaceColors.emerald.iconClassName,
		className: "-translate-x-7 translate-y-4 -rotate-[10deg]",
	},
] as const;

const workspaceRootEmptyDemoFolders = [
	{
		type: "folder",
		title: "Linear equations",
		description: "Folder",
		Icon: FolderOpen,
		iconClassName: workspaceColors.amber.iconClassName,
	},
	{
		type: "folder",
		title: "Systems of equations",
		description: "Folder",
		Icon: FolderOpen,
		iconClassName: workspaceColors.amber.iconClassName,
	},
] as const;

const workspaceRootEmptyDemoItems = [
	{
		type: "pdf",
		title: "Linear equations review",
		description: "PDF",
		previewSrc: "/workspace-empty-demo/linear-equations-review.webp",
		Icon: FileText,
		iconClassName: workspaceColors.rose.iconClassName,
	},
	{
		type: "pdf",
		title: "Solving systems",
		description: "PDF",
		previewSrc: "/workspace-empty-demo/systems-by-substitution.webp",
		Icon: FileText,
		iconClassName: workspaceColors.rose.iconClassName,
	},
	{
		type: "document",
		title: "Slope-intercept notes",
		description: "Document",
		preview:
			"y = mx + b\nm is the slope\nb is the y-intercept\n\nWorked examples for graphing lines and finding intercepts.",
		Icon: FileText,
		iconClassName: workspaceColors.sky.iconClassName,
	},
] as const;

type WorkspaceRootEmptyDemoCard =
	| (typeof workspaceRootEmptyDemoFolders)[number]
	| (typeof workspaceRootEmptyDemoItems)[number];

export function WorkspaceRootEmptyPreview() {
	return (
		<div className="relative min-h-[24rem] flex-1 opacity-90">
			<WorkspaceRootEmptyDemoGrid />
			<div className="pointer-events-none absolute inset-0 z-10 flex">
				<WorkspaceRootDropEmptyState />
			</div>
		</div>
	);
}

function WorkspaceRootDropEmptyState() {
	return (
		<Empty className="border border-dashed bg-background/80 backdrop-blur-[1px]">
			<EmptyHeader>
				<EmptyMedia>
					<WorkspaceRootEmptyMedia />
				</EmptyMedia>
				<EmptyTitle>Drop your files here</EmptyTitle>
				<EmptyDescription>Or click New to get started</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function WorkspaceRootEmptyMedia() {
	return (
		<div className="relative flex h-18 w-24 items-center justify-center">
			{workspaceRootEmptyMediaIcons.map(({ Icon, className, iconClassName }) => (
				<div
					key={`${Icon.displayName ?? Icon.name}-${className}`}
					className={cn("absolute flex items-center justify-center", className)}
				>
					<Icon className={cn("size-8", iconClassName)} strokeWidth={1.9} aria-hidden="true" />
				</div>
			))}
		</div>
	);
}

function WorkspaceRootEmptyDemoGrid() {
	return (
		<div className="flex flex-col gap-5 opacity-65" aria-label="Example Algebra I workspace items">
			<WorkspaceRootEmptyDemoCardRow cards={workspaceRootEmptyDemoFolders} />
			<WorkspaceRootEmptyDemoCardRow cards={workspaceRootEmptyDemoItems} />
		</div>
	);
}

function WorkspaceRootEmptyDemoCardRow({
	cards,
}: {
	cards: readonly WorkspaceRootEmptyDemoCard[];
}) {
	return (
		<section className={workspaceItemGridClass}>
			{cards.map((card) => (
				<WorkspaceRootEmptyDemoCard key={card.title} card={card} />
			))}
		</section>
	);
}

function WorkspaceRootEmptyDemoCard({ card }: { card: WorkspaceRootEmptyDemoCard }) {
	const { Icon } = card;

	return (
		<Card
			className={cn(
				workspaceItemCardBaseClass,
				"pointer-events-none cursor-default bg-card/75 opacity-90 ring-foreground/5 active:cursor-default",
			)}
		>
			<div className={cn(workspaceItemPreviewStageClass, "min-h-24 bg-muted/50")}>
				<WorkspaceRootEmptyDemoCardPreview card={card} />
			</div>
			<CardHeader className="pointer-events-none relative z-10 shrink-0 gap-1 px-3 py-2">
				<CardTitle className="min-w-0">
					<span className="relative z-20 block max-w-full truncate">{card.title}</span>
				</CardTitle>
				<WorkspaceCardMetaRow
					leading={
						<span className="flex min-w-0 items-center gap-1.5">
							<Icon
								className={cn("size-3.5 shrink-0", card.iconClassName)}
								strokeWidth={1.75}
								aria-hidden="true"
							/>
							<span className="truncate">{card.description}</span>
						</span>
					}
					trailing="Example"
				/>
			</CardHeader>
		</Card>
	);
}

function WorkspaceRootEmptyDemoCardPreview({ card }: { card: WorkspaceRootEmptyDemoCard }) {
	const { Icon } = card;

	if (card.type === "pdf") {
		return (
			<div className={workspaceItemPreviewContentLayerClass}>
				<img
					src={card.previewSrc}
					alt=""
					loading="lazy"
					decoding="async"
					className="size-full object-cover object-top opacity-50 grayscale-[20%]"
				/>
			</div>
		);
	}

	if (card.type === "document") {
		return (
			<div className={workspaceItemPreviewContentLayerClass}>
				<div className={workspaceItemDocumentPreviewPanelClass}>
					<p className={workspaceItemDocumentPreviewTextClass}>{card.preview}</p>
				</div>
			</div>
		);
	}

	return (
		<div className={workspaceItemPreviewContentLayerClass}>
			<div className="flex size-full items-center justify-center bg-transparent">
				<Icon
					className={cn(workspaceItemPreviewIconClass, card.iconClassName)}
					strokeWidth={1.75}
					aria-hidden="true"
				/>
			</div>
		</div>
	);
}
