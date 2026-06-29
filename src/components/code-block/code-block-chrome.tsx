import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import type { ComponentProps, HTMLAttributes } from "react";

import { AnimatedIconSwap } from "#/components/ui/animated-icon-swap";
import { Button } from "#/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { useCopyToClipboard } from "#/hooks/use-copy-to-clipboard";
import { cn } from "#/lib/utils";

const codeFileExtensions: Record<string, string> = {
	bash: "sh",
	css: "css",
	diff: "diff",
	go: "go",
	graphql: "graphql",
	html: "html",
	java: "java",
	javascript: "js",
	json: "json",
	jsx: "jsx",
	markdown: "md",
	php: "php",
	python: "py",
	ruby: "rb",
	rust: "rs",
	shellscript: "sh",
	sql: "sql",
	svelte: "svelte",
	text: "txt",
	tsx: "tsx",
	typescript: "ts",
	vue: "vue",
	yaml: "yaml",
};

const getCodeFileExtension = (language: string | null | undefined) =>
	codeFileExtensions[language ?? ""] ?? "txt";

export const CodeBlockHeader = ({
	children,
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			"flex items-center justify-between gap-2 border-b bg-muted/80 px-3 py-2 text-muted-foreground text-xs",
			className,
		)}
		{...props}
	>
		{children}
	</div>
);

export const CodeBlockTitle = ({
	children,
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) => (
	<div className={cn("flex min-w-0 items-center gap-2", className)} {...props}>
		{children}
	</div>
);

export const CodeBlockLabel = ({
	children,
	className,
	...props
}: HTMLAttributes<HTMLSpanElement>) => (
	<span className={cn("truncate font-medium", className)} {...props}>
		{children}
	</span>
);

export const CodeBlockActions = ({
	children,
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) => (
	<div className={cn("-my-1 -mr-1 flex items-center gap-1", className)} {...props}>
		{children}
	</div>
);

type CodeBlockActionButtonProps = ComponentProps<typeof Button> & {
	code: string;
	onError?: (error: Error) => void;
};

export type CodeBlockCopyButtonProps = CodeBlockActionButtonProps & {
	onCopy?: () => void;
	timeout?: number;
};

export const CodeBlockCopyButton = ({
	code,
	onCopy,
	onError,
	timeout = 2000,
	children,
	className,
	...props
}: CodeBlockCopyButtonProps) => {
	const { copied: isCopied, copy } = useCopyToClipboard({
		resetTimeoutMs: timeout,
		onCopy,
		onError,
	});

	const Icon = isCopied ? CheckIcon : CopyIcon;

	return (
		<Button
			aria-label="Copy code"
			className={cn("size-7 shrink-0 text-muted-foreground", className)}
			onClick={() => {
				void copy(code);
			}}
			size="icon"
			title="Copy code"
			variant="ghost"
			{...props}
		>
			{children ?? (
				<AnimatedIconSwap swapKey={isCopied}>
					<Icon size={14} />
				</AnimatedIconSwap>
			)}
		</Button>
	);
};

export type CodeBlockDownloadButtonProps = CodeBlockActionButtonProps & {
	filename?: string;
	language?: string | null;
	onDownload?: () => void;
};

export const CodeBlockDownloadButton = ({
	code,
	children,
	className,
	filename,
	language = "text",
	onDownload,
	onError,
	...props
}: CodeBlockDownloadButtonProps) => {
	const downloadCode = () => {
		if (typeof window === "undefined") {
			onError?.(new Error("Download is not available"));
			return;
		}

		let url: string | null = null;

		try {
			const extension = getCodeFileExtension(language);
			const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
			const anchor = document.createElement("a");

			url = URL.createObjectURL(blob);
			anchor.href = url;
			anchor.download = filename ?? `code.${extension}`;
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			onDownload?.();
		} catch (error) {
			onError?.(error as Error);
		}

		if (url) {
			URL.revokeObjectURL(url);
		}
	};

	return (
		<Button
			aria-label="Download code"
			className={cn("size-7 shrink-0 text-muted-foreground", className)}
			onClick={downloadCode}
			size="icon"
			title="Download file"
			variant="ghost"
			{...props}
		>
			{children ?? <DownloadIcon size={14} />}
		</Button>
	);
};

export type CodeBlockLanguageSelectorProps = ComponentProps<typeof Select>;

export const CodeBlockLanguageSelector = (props: CodeBlockLanguageSelectorProps) => (
	<Select {...props} />
);

export type CodeBlockLanguageSelectorTriggerProps = ComponentProps<typeof SelectTrigger>;

export const CodeBlockLanguageSelectorTrigger = ({
	className,
	...props
}: CodeBlockLanguageSelectorTriggerProps) => (
	<SelectTrigger
		className={cn(
			"h-7 border-transparent bg-transparent px-2 font-medium text-muted-foreground text-xs shadow-none hover:bg-accent/60 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/40 dark:bg-transparent dark:hover:bg-input/40",
			className,
		)}
		size="sm"
		{...props}
	/>
);

export type CodeBlockLanguageSelectorValueProps = ComponentProps<typeof SelectValue>;

export const CodeBlockLanguageSelectorValue = (props: CodeBlockLanguageSelectorValueProps) => (
	<SelectValue {...props} />
);

export type CodeBlockLanguageSelectorContentProps = ComponentProps<typeof SelectContent>;

export const CodeBlockLanguageSelectorContent = ({
	align = "start",
	className,
	...props
}: CodeBlockLanguageSelectorContentProps) => (
	<SelectContent align={align} className={cn("max-h-72", className)} {...props} />
);

export type CodeBlockLanguageSelectorItemProps = ComponentProps<typeof SelectItem>;

export const CodeBlockLanguageSelectorItem = (props: CodeBlockLanguageSelectorItemProps) => (
	<SelectItem {...props} />
);
