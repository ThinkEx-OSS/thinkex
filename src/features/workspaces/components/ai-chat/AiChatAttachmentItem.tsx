import {
	FileTextIcon,
	GlobeIcon,
	ImageIcon,
	Music2Icon,
	PaperclipIcon,
	VideoIcon,
	XIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import {
	Attachment,
	AttachmentAction,
	AttachmentActions,
	AttachmentContent,
	AttachmentDescription,
	AttachmentGroup,
	AttachmentMedia,
	AttachmentTitle,
} from "#/components/ui/attachment";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import type {
	AttachmentData,
	FileAttachmentData,
} from "#/features/workspaces/components/ai-chat/ai-chat-attachments";
import {
	getAttachmentLabel,
	getMediaCategory,
} from "#/features/workspaces/components/ai-chat/ai-chat-attachments";

const mediaCategoryIcons = {
	audio: Music2Icon,
	document: FileTextIcon,
	image: ImageIcon,
	source: GlobeIcon,
	unknown: PaperclipIcon,
	video: VideoIcon,
};

export function AiChatAttachmentGroup({ children }: { children: ReactNode }) {
	return <AttachmentGroup>{children}</AttachmentGroup>;
}

export function AiChatAttachmentItem({
	data,
	onRemove,
}: {
	data: AttachmentData;
	onRemove?: () => void;
}) {
	if (isImageAttachment(data)) {
		return <AiChatImageAttachment data={data} onRemove={onRemove} />;
	}

	return (
		<Attachment state={getAttachmentState(data)} size="sm">
			<AiChatAttachmentMedia data={data} />
			<AiChatAttachmentContent data={data} />
			<AiChatAttachmentRemoveAction data={data} onRemove={onRemove} />
		</Attachment>
	);
}

function isImageAttachment(data: AttachmentData): data is FileAttachmentData {
	return data.type === "file" && getMediaCategory(data) === "image";
}

function AiChatImageAttachment({
	data,
	onRemove,
}: {
	data: FileAttachmentData;
	onRemove?: () => void;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const label = getAttachmentLabel(data);
	const imageUrl = data.status === "ready" ? data.url : undefined;

	return (
		<>
			<div className="relative size-24 shrink-0" data-slot="attachment">
				{imageUrl ? (
					<button
						aria-label={`Preview ${label}`}
						className="size-full cursor-zoom-in overflow-hidden rounded-xl focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
						onClick={() => setIsOpen(true)}
						type="button"
					>
						<img
							alt={label}
							className="size-full object-cover"
							height={96}
							src={imageUrl}
							width={96}
						/>
					</button>
				) : (
					<div className="size-full overflow-hidden rounded-xl">
						<Skeleton aria-hidden="true" className="size-full rounded-none" />
						<span className="sr-only">Preparing {label}</span>
					</div>
				)}
				{onRemove ? (
					<button
						aria-label={`Remove ${label}`}
						className="absolute top-1 right-1 z-10 flex size-5 items-center justify-center rounded-full bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
						onClick={(event) => {
							event.stopPropagation();
							onRemove();
						}}
						type="button"
					>
						<XIcon className="size-3" />
					</button>
				) : null}
			</div>

			{imageUrl ? (
				<Dialog open={isOpen} onOpenChange={setIsOpen}>
					<DialogContent className="max-w-[min(96vw,900px)] gap-4 p-4 sm:max-w-4xl">
						<DialogHeader className="pr-8">
							<DialogTitle className="truncate text-base">{label}</DialogTitle>
						</DialogHeader>
						<div className="flex max-h-[78vh] min-h-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
							<img alt={label} className="max-h-[78vh] max-w-full object-contain" src={imageUrl} />
						</div>
					</DialogContent>
				</Dialog>
			) : null}
		</>
	);
}

function AiChatAttachmentMedia({ data }: { data: AttachmentData }) {
	if (data.type === "file" && data.status === "loading") {
		return (
			<AttachmentMedia>
				<Spinner className="size-3.5" />
			</AttachmentMedia>
		);
	}

	if (data.type === "file" && data.url && getMediaCategory(data) === "video") {
		return (
			<AttachmentMedia>
				{/* Thumbnail-only tile — controls omitted intentionally (40 px square). */}
				<video
					aria-label={`Video preview: ${getAttachmentLabel(data)}`}
					className="size-full object-cover"
					muted
					src={data.url}
				/>
			</AttachmentMedia>
		);
	}

	const Icon = mediaCategoryIcons[getMediaCategory(data)];

	return (
		<AttachmentMedia>
			<Icon />
		</AttachmentMedia>
	);
}

function AiChatAttachmentContent({ data }: { data: AttachmentData }) {
	return (
		<AttachmentContent>
			<AttachmentTitle>{getAttachmentLabel(data)}</AttachmentTitle>
			<AttachmentDescription>{getAttachmentDescription(data)}</AttachmentDescription>
		</AttachmentContent>
	);
}

function AiChatAttachmentRemoveAction({
	data,
	onRemove,
}: {
	data: AttachmentData;
	onRemove?: () => void;
}) {
	if (!onRemove) {
		return null;
	}

	return (
		<AttachmentActions>
			<AttachmentAction
				aria-label={`Remove ${getAttachmentLabel(data)}`}
				className="size-5 rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
				onClick={(event) => {
					event.stopPropagation();
					onRemove();
				}}
			>
				<XIcon className="size-3" />
			</AttachmentAction>
		</AttachmentActions>
	);
}

function getAttachmentState(data: AttachmentData) {
	if (data.type === "file" && data.status === "loading") {
		return "uploading";
	}

	return "done";
}

function getAttachmentDescription(data: AttachmentData) {
	if (data.status === "loading") {
		return "Preparing";
	}

	return getMediaCategory(data);
}
