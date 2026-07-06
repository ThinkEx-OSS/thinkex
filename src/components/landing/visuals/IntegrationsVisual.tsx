import {
	BookOpen,
	Cloud,
	FilePen,
	FileSpreadsheet,
	Headphones,
	type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

import { Gravity, MatterBody } from "../gravity";

type IntegrationThumbnailKind = "pdf" | "table" | "image" | "audio" | "notes";

type IntegrationBlock = {
	id: string;
	label: string;
	icon: LucideIcon;
	thumbnail: IntegrationThumbnailKind;
	x: string;
	y: string;
	angle: number;
	className: string;
};

const integrationBlocks: IntegrationBlock[] = [
	{
		id: "pdf",
		label: "PDF",
		icon: BookOpen,
		thumbnail: "pdf",
		x: "17%",
		y: "28%",
		angle: -7,
		className: "border-red-500/25 bg-red-500/8 text-red-700 dark:text-red-300",
	},
	{
		id: "table",
		label: "Table",
		icon: FileSpreadsheet,
		thumbnail: "table",
		x: "49%",
		y: "24%",
		angle: 5,
		className: "border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
	},
	{
		id: "image",
		label: "Image",
		icon: Cloud,
		thumbnail: "image",
		x: "82%",
		y: "30%",
		angle: 4,
		className: "border-violet-500/25 bg-violet-500/8 text-violet-700 dark:text-violet-300",
	},
	{
		id: "audio",
		label: "Audio",
		icon: Headphones,
		thumbnail: "audio",
		x: "58%",
		y: "43%",
		angle: 8,
		className: "border-orange-500/25 bg-orange-500/8 text-orange-700 dark:text-orange-300",
	},
	{
		id: "notes",
		label: "Doc",
		icon: FilePen,
		thumbnail: "notes",
		x: "77%",
		y: "52%",
		angle: -8,
		className: "border-blue-500/25 bg-blue-500/8 text-blue-700 dark:text-blue-300",
	},
];

export function IntegrationsVisual() {
	return (
		<div className="relative h-full min-h-52 w-full overflow-hidden">
			<Gravity gravity={{ x: 0, y: 1 }} topBoundaryOffset={220} className="min-h-52">
				{integrationBlocks.map((block) => (
					<MatterBody key={block.id} x={block.x} y={block.y} angle={block.angle}>
						<IntegrationMaterialCard block={block} />
					</MatterBody>
				))}
			</Gravity>
		</div>
	);
}

function IntegrationMaterialCard({ block }: { block: IntegrationBlock }) {
	const Icon = block.icon;

	return (
		<div
			className={cn(
				"flex size-[6.25rem] min-w-0 cursor-grab flex-col gap-1 rounded-md border p-1 text-left text-sm shadow-sm backdrop-blur active:cursor-grabbing",
				block.className,
			)}
		>
			<IntegrationThumbnail kind={block.thumbnail} />
			<div className="mt-auto min-w-0 self-stretch">
				<div className="flex min-w-0 items-center gap-1">
					<Icon className="size-3 shrink-0" aria-hidden="true" />
					<span className="truncate text-[0.7rem] font-medium">{block.label}</span>
				</div>
			</div>
		</div>
	);
}

const thumbnailRenderers = {
	pdf: PdfThumbnail,
	table: TableThumbnail,
	image: ImageThumbnail,
	audio: AudioThumbnail,
	notes: NotesThumbnail,
} satisfies Record<IntegrationThumbnailKind, () => ReactNode>;

function IntegrationThumbnail({ kind }: { kind: IntegrationThumbnailKind }) {
	const Thumbnail = thumbnailRenderers[kind];

	return <Thumbnail />;
}

function PdfThumbnail() {
	return (
		<div className="grid min-h-0 w-full flex-1 gap-1 p-1">
			<div className="h-1.5 rounded-sm bg-current/45" />
			<div className="h-0.5 rounded-sm bg-current/25" />
			<div className="h-0.5 w-4/5 rounded-sm bg-current/20" />
			<div className="mt-auto grid grid-cols-2 gap-0.5">
				<div className="h-2 rounded-[2px] bg-current/20" />
				<div className="h-2 rounded-[2px] bg-current/15" />
			</div>
		</div>
	);
}

function TableThumbnail() {
	return (
		<div className="grid min-h-0 w-full flex-1 grid-cols-3 gap-0.5 p-1">
			{Array.from({ length: 9 }).map((_, index) => (
				<div
					key={index}
					className={cn("rounded-[2px]", index < 3 ? "bg-current/35" : "bg-current/15")}
				/>
			))}
		</div>
	);
}

function ImageThumbnail() {
	return (
		<div className="relative min-h-0 w-full flex-1 overflow-hidden">
			<div className="absolute inset-x-1 bottom-1 h-5 rounded-[3px] bg-current/18" />
			<div className="absolute right-2 bottom-1 left-8 h-7 rounded-[3px] bg-current/25" />
			<div className="absolute top-1 left-1 size-2 rounded-full bg-current/35" />
		</div>
	);
}

function AudioThumbnail() {
	return (
		<div className="flex min-h-0 w-full flex-1 items-center gap-1 px-1.5">
			{[14, 24, 34, 20, 42, 28, 16, 36, 22].map((height, index) => (
				<div
					key={index}
					className="flex-1 rounded-full bg-current/35"
					style={{ height: `${height}%` }}
				/>
			))}
		</div>
	);
}

function NotesThumbnail() {
	return (
		<div className="grid min-h-0 w-full flex-1 gap-1 p-1">
			<div className="h-1.5 rounded-sm bg-current/35" />
			<div className="h-0.5 rounded-sm bg-current/20" />
			<div className="h-0.5 w-5/6 rounded-sm bg-current/18" />
			<div className="mt-auto h-3 rounded-sm bg-current/14" />
		</div>
	);
}
