import type { ChatStatus, FileUIPart } from "ai";
import { CornerDownLeftIcon, SquareIcon, XIcon } from "lucide-react";
import type {
	ChangeEventHandler,
	ClipboardEventHandler,
	ComponentProps,
	DragEvent,
	FormEvent,
	FormEventHandler,
	HTMLAttributes,
	KeyboardEventHandler,
	ReactNode,
} from "react";
import { Children, createContext, use, useRef } from "react";
import {
	type FileAttachmentData,
	toSendableFileParts,
} from "#/features/workspaces/components/ai-chat/ai-chat-attachments";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "#/components/ui/input-group.tsx";
import { Spinner } from "#/components/ui/spinner.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip.tsx";
import { hasNativeFiles } from "#/lib/native-file-drag";
import { cn } from "#/lib/utils.ts";

function handlePromptInputDragOver(event: DragEvent<HTMLFormElement>) {
	if (hasNativeFiles(event.dataTransfer)) {
		event.preventDefault();
	}
}

// ============================================================================
// Attachment Context & Types
// ============================================================================

export type PromptInputAttachmentFile = FileAttachmentData;

export interface AttachmentsContext {
	files: PromptInputAttachmentFile[];
	composerReady?: boolean;
	add: (files: File[] | FileList) => void;
	remove: (id: string) => void;
	clear: () => void;
	openFileDialog: () => void;
}

// ============================================================================
// Component Context & Hooks
// ============================================================================

const LocalAttachmentsContext = createContext<AttachmentsContext | null>(null);

export const usePromptInputAttachments = () => {
	const context = use(LocalAttachmentsContext);
	if (!context) {
		throw new Error("usePromptInputAttachments must be used within a PromptInput");
	}
	return context;
};

export interface PromptInputMessage {
	text: string;
	files: FileUIPart[];
}

export type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, "onSubmit" | "onError"> & {
	accept?: string;
	attachments: Omit<AttachmentsContext, "openFileDialog">;
	inputGroupClassName?: string;
	multiple?: boolean;
	onSubmit: (
		message: PromptInputMessage,
		event: FormEvent<HTMLFormElement>,
	) => boolean | undefined | Promise<boolean | undefined>;
};

export const PromptInput = ({
	accept,
	attachments,
	className,
	children,
	inputGroupClassName,
	multiple,
	onSubmit,
	...props
}: PromptInputProps) => {
	const inputRef = useRef<HTMLInputElement | null>(null);

	const openFileDialog = () => {
		inputRef.current?.click();
	};

	const attachmentsCtx: AttachmentsContext = {
		...attachments,
		openFileDialog,
	};

	const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
		if (event.currentTarget.files) {
			attachmentsCtx.add(event.currentTarget.files);
		}
		event.currentTarget.value = "";
	};

	const handleDrop = (event: DragEvent<HTMLFormElement>) => {
		if (hasNativeFiles(event.dataTransfer)) {
			event.preventDefault();
			event.stopPropagation();
		}
		if (event.dataTransfer.files.length > 0) {
			attachmentsCtx.add(event.dataTransfer.files);
		}
	};

	const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
		void (async () => {
			event.preventDefault();

			const form = event.currentTarget;
			const formData = new FormData(form);
			const text = (formData.get("message") as string) || "";

			form.reset();

			if (attachmentsCtx.composerReady === false) {
				return;
			}

			try {
				const sendFiles = toSendableFileParts(attachmentsCtx.files);
				const result = onSubmit({ files: sendFiles, text }, event);

				if (result instanceof Promise) {
					try {
						const accepted = await result;
						if (accepted !== false) {
							attachmentsCtx.clear();
						}
					} catch {
						// Don't clear on error - user may want to retry
					}
				} else if (result !== false) {
					attachmentsCtx.clear();
				}
			} catch {
				// Don't clear on error - user may want to retry
			}
		})();
	};

	return (
		<LocalAttachmentsContext.Provider value={attachmentsCtx}>
			<input
				accept={accept}
				aria-label="Upload files"
				className="hidden"
				multiple={multiple}
				onChange={handleChange}
				ref={inputRef}
				title="Upload files"
				type="file"
			/>
			<form
				data-prompt-input-local-drop-target=""
				className={cn("w-full", className)}
				onDragOver={handlePromptInputDragOver}
				onDrop={handleDrop}
				onSubmit={handleSubmit}
				{...props}
			>
				<InputGroup
					className={cn(
						"has-[[data-slot=input-group-control]:focus-visible]:!border-ring/60 has-[[data-slot=input-group-control]:focus-visible]:!ring-2 has-[[data-slot=input-group-control]:focus-visible]:!ring-ring/35",
						inputGroupClassName,
					)}
				>
					{children}
				</InputGroup>
			</form>
		</LocalAttachmentsContext.Provider>
	);
};

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputBody = ({ className, ...props }: PromptInputBodyProps) => (
	<div className={cn("contents", className)} {...props} />
);

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>;

export const PromptInputTextarea = ({
	disabled,
	onChange,
	onKeyDown,
	className,
	placeholder = "What would you like to know?",
	...props
}: PromptInputTextareaProps) => {
	const attachments = usePromptInputAttachments();
	const isComposingRef = useRef(false);
	const composerReady = attachments.composerReady !== false;

	const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
		onKeyDown?.(event);

		if (event.defaultPrevented) {
			return;
		}

		if (event.key === "Enter") {
			if (isComposingRef.current || event.nativeEvent.isComposing) {
				return;
			}
			if (event.shiftKey) {
				return;
			}
			event.preventDefault();

			const { form } = event.currentTarget;
			const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
			if (!submitButton || submitButton.disabled) {
				return;
			}

			form?.requestSubmit();
		}

		if (
			event.key === "Backspace" &&
			event.currentTarget.value === "" &&
			attachments.files.length > 0
		) {
			event.preventDefault();
			const lastAttachment = attachments.files.at(-1);
			if (lastAttachment) {
				attachments.remove(lastAttachment.id);
			}
		}
	};

	const handlePaste: ClipboardEventHandler<HTMLTextAreaElement> = (event) => {
		const items = event.clipboardData?.items;

		if (!items) {
			return;
		}

		const files: File[] = [];

		for (const item of items) {
			if (item.kind === "file") {
				const file = item.getAsFile();
				if (file) {
					files.push(file);
				}
			}
		}

		if (files.length > 0) {
			event.preventDefault();
			attachments.add(files);
		}
	};

	const handleCompositionEnd = () => {
		isComposingRef.current = false;
	};
	const handleCompositionStart = () => {
		isComposingRef.current = true;
	};

	return (
		<InputGroupTextarea
			className={cn("field-sizing-content max-h-48 min-h-16", className)}
			disabled={disabled || !composerReady}
			name="message"
			onChange={onChange}
			onCompositionEnd={handleCompositionEnd}
			onCompositionStart={handleCompositionStart}
			onKeyDown={handleKeyDown}
			onPaste={handlePaste}
			placeholder={placeholder}
			{...props}
		/>
	);
};

export type PromptInputHeaderProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;

export const PromptInputHeader = ({ className, ...props }: PromptInputHeaderProps) => (
	<InputGroupAddon
		align="block-end"
		className={cn("order-first flex-wrap gap-1", className)}
		{...props}
	/>
);

export type PromptInputFooterProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;

export const PromptInputFooter = ({ className, ...props }: PromptInputFooterProps) => (
	<InputGroupAddon
		align="block-end"
		className={cn("justify-between gap-1", className)}
		{...props}
	/>
);

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTools = ({ className, ...props }: PromptInputToolsProps) => (
	<div className={cn("flex min-w-0 items-center gap-1", className)} {...props} />
);

export type PromptInputButtonTooltip =
	| string
	| {
			content: ReactNode;
			shortcut?: string;
			side?: ComponentProps<typeof TooltipContent>["side"];
	  };

export type PromptInputButtonProps = ComponentProps<typeof InputGroupButton> & {
	tooltip?: PromptInputButtonTooltip;
};

export const PromptInputButton = ({
	variant = "ghost",
	className,
	size,
	tooltip,
	...props
}: PromptInputButtonProps) => {
	const newSize = size ?? (Children.count(props.children) > 1 ? "sm" : "icon-sm");

	const button = (
		<InputGroupButton
			className={cn(className)}
			size={newSize}
			type="button"
			variant={variant}
			{...props}
		/>
	);

	if (!tooltip) {
		return button;
	}

	const tooltipContent = typeof tooltip === "string" ? tooltip : tooltip.content;
	const shortcut = typeof tooltip === "string" ? undefined : tooltip.shortcut;
	const side = typeof tooltip === "string" ? "top" : (tooltip.side ?? "top");

	return (
		<Tooltip>
			<TooltipTrigger render={button} />
			<TooltipContent side={side}>
				{tooltipContent}
				{shortcut && <span className="ml-2 text-muted-foreground">{shortcut}</span>}
			</TooltipContent>
		</Tooltip>
	);
};

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
	status?: ChatStatus;
	onStop?: () => void;
};

export const PromptInputSubmit = ({
	className,
	variant = "default",
	size = "icon-sm",
	status,
	onStop,
	onClick,
	children,
	...props
}: PromptInputSubmitProps) => {
	const isGenerating = status === "submitted" || status === "streaming";

	let Icon = <CornerDownLeftIcon className="size-4" />;

	if (status === "submitted") {
		Icon = <Spinner />;
	} else if (status === "streaming") {
		Icon = <SquareIcon className="size-4" />;
	} else if (status === "error") {
		Icon = <XIcon className="size-4" />;
	}

	const handleClick = (event: Parameters<NonNullable<PromptInputSubmitProps["onClick"]>>[0]) => {
		if (isGenerating && onStop) {
			event.preventDefault();
			onStop();
			return;
		}
		onClick?.(event);
	};

	return (
		<InputGroupButton
			aria-label={isGenerating ? "Stop" : "Submit"}
			className={cn(className)}
			onClick={handleClick}
			size={size}
			type={isGenerating && onStop ? "button" : "submit"}
			variant={variant}
			{...props}
		>
			{children ?? Icon}
		</InputGroupButton>
	);
};
