import type { ReactNode } from "react";
import { FileText, FolderOpen, Image } from "lucide-react";

import { Card, CardHeader, CardTitle } from "#/components/ui/card";
import WorkspaceClickableEmptyState from "#/features/workspaces/components/WorkspaceClickableEmptyState";
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

export function WorkspaceRootEmptyPreview({ onUploadFiles }: { onUploadFiles: () => void }) {
	return (
		<div className="relative min-h-[24rem] flex-1 opacity-90">
			<WorkspaceRootEmptyDemoGrid />
			<WorkspaceClickableEmptyState
				className="absolute inset-0 z-10 rounded-lg"
				aria-label="Upload files to this workspace"
				description="Click anywhere here to upload files"
				media={<WorkspaceRootEmptyMedia />}
				onClick={onUploadFiles}
				surfaceClassName="bg-background/80 backdrop-blur-[1px]"
				title="Drop your files here"
			/>
		</div>
	);
}

function WorkspaceRootEmptyMedia() {
	return (
		<span className="relative flex h-18 w-24 items-center justify-center">
			{workspaceRootEmptyMediaIcons.map(({ Icon, className, iconClassName }) => (
				<span
					key={`${Icon.displayName ?? Icon.name}-${className}`}
					className={cn("absolute flex items-center justify-center", className)}
				>
					<Icon className={cn("size-8", iconClassName)} strokeWidth={1.9} aria-hidden="true" />
				</span>
			))}
		</span>
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
			<div className={cn(workspaceItemPreviewStageClass, "bg-muted/50 sm:min-h-24")}>
				<WorkspaceRootEmptyDemoCardPreview card={card} />
			</div>
			<CardHeader className="pointer-events-none relative z-10 min-w-0 flex-1 self-center justify-start gap-1 py-2 pr-3 pl-3 sm:flex-none sm:shrink-0 sm:self-auto sm:px-3">
				<CardTitle className="min-w-0">
					<span className="relative z-20 block max-w-full truncate">{card.title}</span>
				</CardTitle>
				<WorkspaceCardMetaRow
					leading={
						<span className="flex min-w-0 items-center sm:gap-1.5">
							<Icon
								className={cn("hidden size-3.5 shrink-0 sm:block", card.iconClassName)}
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
	if (card.type === "pdf") {
		return (
			<WorkspaceRootEmptyDemoMobileIconDesktopPreview card={card}>
				<div className={workspaceItemPreviewContentLayerClass}>
					<img
						src={card.previewSrc}
						alt=""
						loading="lazy"
						decoding="async"
						className="size-full object-cover object-top opacity-50 grayscale-[20%]"
					/>
				</div>
			</WorkspaceRootEmptyDemoMobileIconDesktopPreview>
		);
	}

	if (card.type === "document") {
		return (
			<WorkspaceRootEmptyDemoMobileIconDesktopPreview card={card}>
				<div className={workspaceItemPreviewContentLayerClass}>
					<div className={workspaceItemDocumentPreviewPanelClass}>
						<p className={workspaceItemDocumentPreviewTextClass}>{card.preview}</p>
					</div>
				</div>
			</WorkspaceRootEmptyDemoMobileIconDesktopPreview>
		);
	}

	return <WorkspaceRootEmptyDemoIconPreview card={card} />;
}

function WorkspaceRootEmptyDemoMobileIconDesktopPreview({
	card,
	children,
}: {
	card: WorkspaceRootEmptyDemoCard;
	children: ReactNode;
}) {
	return (
		<>
			<div className={cn(workspaceItemPreviewContentLayerClass, "sm:hidden")}>
				<WorkspaceRootEmptyDemoIconPreview card={card} />
			</div>
			<div className={cn(workspaceItemPreviewContentLayerClass, "hidden sm:block")}>{children}</div>
		</>
	);
}

function WorkspaceRootEmptyDemoIconPreview({ card }: { card: WorkspaceRootEmptyDemoCard }) {
	const { Icon } = card;

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
