import type { FileUIPart, SourceDocumentUIPart } from "ai";
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
	AttachmentTrigger,
} from "#/components/ui/attachment";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "#/components/ui/dialog";
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
	if (isPreviewableImageAttachment(data)) {
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

export function getFileAttachmentData(part: FileUIPart): FileAttachmentData {
	return {
		filename: part.filename,
		id: getFileAttachmentId(part),
		mediaType: part.mediaType,
		status: "ready",
		type: "file",
		url: part.url,
	};
}

export function getSourceDocumentAttachmentData(
	part: SourceDocumentUIPart,
): SourceDocumentUIPart & { id: string } {
	return { ...part, id: part.sourceId };
}

function getFileAttachmentId(part: FileUIPart): string {
	return part.url;
}

function isPreviewableImageAttachment(
	data: AttachmentData,
): data is FileAttachmentData & { status: "ready"; url: string } {
	return (
		data.type === "file" &&
		data.status === "ready" &&
		getMediaCategory(data) === "image" &&
		Boolean(data.url)
	);
}

function AiChatImageAttachment({
	data,
	onRemove,
}: {
	data: FileAttachmentData & { status: "ready"; url: string };
	onRemove?: () => void;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const label = getAttachmentLabel(data);

	return (
		<>
			<Attachment
				className="cursor-zoom-in focus-within:ring-2"
				orientation="vertical"
				size="default"
			>
				<AttachmentMedia variant="image">
					<img
						alt={label}
						className="size-full object-cover"
						height={96}
						src={data.url}
						width={96}
					/>
				</AttachmentMedia>
				<AttachmentTrigger aria-label={`Preview ${label}`} onClick={() => setIsOpen(true)} />
				<AiChatAttachmentRemoveAction data={data} onRemove={onRemove} />
			</Attachment>

			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent className="max-w-[min(96vw,900px)] gap-4 p-4 sm:max-w-4xl">
					<DialogHeader className="pr-8">
						<DialogTitle className="truncate text-base">{label}</DialogTitle>
					</DialogHeader>
					<div className="flex max-h-[78vh] min-h-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
						<img alt={label} className="max-h-[78vh] max-w-full object-contain" src={data.url} />
					</div>
				</DialogContent>
			</Dialog>
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

	if (data.type === "file" && data.url && getMediaCategory(data) === "image") {
		return (
			<AttachmentMedia variant="image">
				<img
					alt={getAttachmentLabel(data)}
					className="size-full object-cover"
					height={40}
					src={data.url}
					width={40}
				/>
			</AttachmentMedia>
		);
	}

	if (data.type === "file" && data.url && getMediaCategory(data) === "video") {
		return (
			<AttachmentMedia>
				{/* Thumbnail-only tile — controls omitted intentionally (40 px square). */}
				<video className="size-full object-cover" muted src={data.url} />
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
				onClick={(event) => {
					event.stopPropagation();
					onRemove();
				}}
			>
				<XIcon />
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
	if (data.type === "source-document") {
		return "Source";
	}

	if (data.status === "loading") {
		return "Preparing";
	}

	return getMediaCategory(data);
}
