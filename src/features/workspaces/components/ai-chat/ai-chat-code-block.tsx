import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { isValidElement, useEffect, useState } from "react";
import type { ThemedToken } from "shiki/core";
import {
	CodeBlockActions,
	CodeBlockCopyButton,
	CodeBlockDownloadButton,
	CodeBlockHeader,
	CodeBlockLabel,
	CodeBlockTitle,
} from "#/components/code-block/code-block-chrome";
import {
	getCodeLanguageLabel,
	highlightCodeTokens,
	normalizeCodeLanguage,
	type SupportedCodeLanguage,
} from "#/features/workspaces/documents/code-block-shiki/highlighter";
import { cn } from "#/lib/utils.ts";

export {
	CodeBlockActions,
	CodeBlockCopyButton,
	CodeBlockDownloadButton,
	CodeBlockHeader,
	CodeBlockLabel,
	CodeBlockLanguageSelector,
	CodeBlockLanguageSelectorContent,
	CodeBlockLanguageSelectorItem,
	CodeBlockLanguageSelectorTrigger,
	CodeBlockLanguageSelectorValue,
	CodeBlockTitle,
} from "#/components/code-block/code-block-chrome";

// Shiki uses bitflags for font styles: 1=italic, 2=bold, 4=underline
// oxlint-disable-next-line eslint(no-bitwise)
const isItalic = (fontStyle: number | undefined) => fontStyle && fontStyle & 1;
// oxlint-disable-next-line eslint(no-bitwise)
const isBold = (fontStyle: number | undefined) => fontStyle && fontStyle & 2;
const isUnderline = (fontStyle: number | undefined) =>
	// oxlint-disable-next-line eslint(no-bitwise)
	fontStyle && fontStyle & 4;

type CodeBlockLanguage = SupportedCodeLanguage | "text";

const normalizeChatCodeLanguage = (language: string | null | undefined): CodeBlockLanguage =>
	normalizeCodeLanguage(language) ?? "text";

const getLanguageFromClassName = (className: unknown) => {
	const classes = Array.isArray(className)
		? className.join(" ")
		: typeof className === "string"
			? className
			: "";

	return classes.match(/(?:^|\s)language-([^\s]+)/)?.[1] ?? null;
};

const getTextContent = (value: ReactNode): string => {
	if (typeof value === "string" || typeof value === "number") {
		return String(value);
	}

	if (Array.isArray(value)) {
		return value.map(getTextContent).join("");
	}

	if (isValidElement<{ children?: ReactNode }>(value)) {
		return getTextContent(value.props.children);
	}

	return "";
};

// Transform tokens to include pre-computed keys to avoid noArrayIndexKey lint
interface KeyedToken {
	token: ThemedToken;
	key: string;
}
interface KeyedLine {
	tokens: KeyedToken[];
	key: string;
}

const addKeysToTokens = (lines: ThemedToken[][]): KeyedLine[] =>
	lines.map((line, lineIdx) => ({
		key: `line-${lineIdx}`,
		tokens: line.map((token, tokenIdx) => ({
			key: `line-${lineIdx}-${tokenIdx}`,
			token,
		})),
	}));

// Token rendering component
const TokenSpan = ({ token }: { token: ThemedToken }) => (
	<span
		className="dark:!bg-[var(--shiki-dark-bg)] dark:!text-[var(--shiki-dark)]"
		style={
			{
				backgroundColor: token.bgColor,
				color: token.color,
				fontStyle: isItalic(token.fontStyle) ? "italic" : undefined,
				fontWeight: isBold(token.fontStyle) ? "bold" : undefined,
				textDecoration: isUnderline(token.fontStyle) ? "underline" : undefined,
				...token.htmlStyle,
			} as CSSProperties
		}
	>
		{token.content}
	</span>
);

// Line number styles using CSS counters
const LINE_NUMBER_CLASSES = cn(
	"block",
	"before:content-[counter(line)]",
	"before:inline-block",
	"before:[counter-increment:line]",
	"before:w-8",
	"before:mr-4",
	"before:text-right",
	"before:text-muted-foreground/50",
	"before:font-mono",
	"before:select-none",
);

// Line rendering component
const LineSpan = ({
	keyedLine,
	showLineNumbers,
}: {
	keyedLine: KeyedLine;
	showLineNumbers: boolean;
}) => (
	<span className={showLineNumbers ? LINE_NUMBER_CLASSES : "block"}>
		{keyedLine.tokens.length === 0
			? "\n"
			: keyedLine.tokens.map(({ token, key }) => <TokenSpan key={key} token={token} />)}
	</span>
);

// Types
type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
	code: string;
	language: CodeBlockLanguage;
	showLineNumbers?: boolean;
};

interface TokenizedCode {
	tokens: ThemedToken[][];
	fg: string;
	bg: string;
}

// Token cache
const tokensCache = new Map<string, TokenizedCode>();
const pendingTokenKeys = new Set<string>();

// Subscribers for async token updates
const subscribers = new Map<string, Set<(result: TokenizedCode) => void>>();

const getTokensCacheKey = (code: string, language: SupportedCodeLanguage) => `${language}\0${code}`;

// Create raw tokens for immediate display while highlighting loads
const createRawTokens = (code: string): TokenizedCode => ({
	bg: "transparent",
	fg: "inherit",
	tokens: code.split("\n").map((line) =>
		line === ""
			? []
			: [
					{
						color: "inherit",
						content: line,
					} as ThemedToken,
				],
	),
});

// Synchronous highlight with callback for async results
const highlightCode = (
	code: string,
	language: CodeBlockLanguage,
	// oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-callbacks)
	callback?: (result: TokenizedCode) => void,
): TokenizedCode | null => {
	if (language === "text") {
		return createRawTokens(code);
	}

	const tokensCacheKey = getTokensCacheKey(code, language);

	// Return cached result if available
	const cached = tokensCache.get(tokensCacheKey);
	if (cached) {
		return cached;
	}

	// Subscribe callback if provided
	if (callback) {
		if (!subscribers.has(tokensCacheKey)) {
			subscribers.set(tokensCacheKey, new Set());
		}
		subscribers.get(tokensCacheKey)?.add(callback);
	}

	if (pendingTokenKeys.has(tokensCacheKey)) {
		return null;
	}

	pendingTokenKeys.add(tokensCacheKey);

	// Start highlighting in background - fire-and-forget async pattern
	highlightCodeTokens({ code, language })
		// oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then)
		.then((tokenized) => {
			if (!tokenized) {
				pendingTokenKeys.delete(tokensCacheKey);
				return;
			}

			// Cache the result
			tokensCache.set(tokensCacheKey, tokenized);

			// Notify all subscribers
			const subs = subscribers.get(tokensCacheKey);
			if (subs) {
				for (const sub of subs) {
					sub(tokenized);
				}
				subscribers.delete(tokensCacheKey);
			}
			pendingTokenKeys.delete(tokensCacheKey);
		})
		// oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then), eslint-plugin-promise(prefer-await-to-callbacks)
		.catch((error) => {
			console.error("Failed to highlight code:", error);
			pendingTokenKeys.delete(tokensCacheKey);
			subscribers.delete(tokensCacheKey);
		});

	return null;
};

function CodeBlockBody({
	tokenized,
	showLineNumbers,
	className,
}: {
	tokenized: TokenizedCode;
	showLineNumbers: boolean;
	className?: string;
}) {
	const keyedLines = addKeysToTokens(tokenized.tokens);

	return (
		<pre
			className={cn(
				"dark:!bg-[var(--shiki-dark-bg)] dark:!text-[var(--shiki-dark)] m-0 p-4 text-sm",
				className,
			)}
			style={{
				backgroundColor: tokenized.bg,
				color: tokenized.fg,
			}}
		>
			<code
				className={cn(
					"font-mono text-sm",
					showLineNumbers && "[counter-increment:line_0] [counter-reset:line]",
				)}
			>
				{keyedLines.map((keyedLine) => (
					<LineSpan key={keyedLine.key} keyedLine={keyedLine} showLineNumbers={showLineNumbers} />
				))}
			</code>
		</pre>
	);
}

const CodeBlockContainer = ({
	className,
	language,
	style,
	...props
}: HTMLAttributes<HTMLDivElement> & { language: string }) => (
	<div
		className={cn(
			"group relative w-full overflow-hidden rounded-md border bg-background text-foreground",
			className,
		)}
		data-language={language}
		style={{
			containIntrinsicSize: "auto 200px",
			contentVisibility: "auto",
			...style,
		}}
		{...props}
	/>
);

const CodeBlockContent = ({
	code,
	language,
	showLineNumbers = false,
}: {
	code: string;
	language: CodeBlockLanguage;
	showLineNumbers?: boolean;
}) => {
	const syncTokens = highlightCode(code, language) ?? createRawTokens(code);

	const [asyncTokens, setAsyncTokens] = useState<{
		code: string;
		language: CodeBlockLanguage;
		tokenized: TokenizedCode;
	} | null>(null);

	useEffect(() => {
		let cancelled = false;

		highlightCode(code, language, (result) => {
			if (!cancelled) {
				setAsyncTokens({ code, language, tokenized: result });
			}
		});

		return () => {
			cancelled = true;
		};
	}, [code, language]);

	const tokenized =
		asyncTokens?.code === code && asyncTokens.language === language
			? asyncTokens.tokenized
			: syncTokens;

	return (
		<div className="relative overflow-auto">
			<CodeBlockBody showLineNumbers={showLineNumbers} tokenized={tokenized} />
		</div>
	);
};

export const CodeBlock = ({
	code,
	language,
	showLineNumbers = false,
	className,
	children,
	...props
}: CodeBlockProps) => {
	return (
		<CodeBlockContainer className={className} language={language} {...props}>
			{children}
			<CodeBlockContent code={code} language={language} showLineNumbers={showLineNumbers} />
		</CodeBlockContainer>
	);
};

type MarkdownCodeBlockProps = HTMLAttributes<HTMLElement> & {
	"data-block"?: string | boolean;
	node?: {
		properties?: Record<string, unknown>;
	};
};

export const MarkdownCodeBlock = ({
	children,
	className,
	node,
	"data-block": dataBlock,
	...props
}: MarkdownCodeBlockProps) => {
	const isBlock = dataBlock !== undefined;

	if (!isBlock) {
		return (
			<code
				className={cn("rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.9em]", className)}
				{...props}
			>
				{children}
			</code>
		);
	}

	const rawLanguage =
		getLanguageFromClassName(className) ?? getLanguageFromClassName(node?.properties?.className);
	const language = normalizeChatCodeLanguage(rawLanguage);
	const label = language === "text" ? (rawLanguage ?? "text") : getCodeLanguageLabel(language);
	const code = getTextContent(children).replace(/\n$/, "");

	return (
		<CodeBlock className="my-4" code={code} language={language} showLineNumbers {...props}>
			<CodeBlockHeader>
				<CodeBlockTitle>
					<CodeBlockLabel>{label}</CodeBlockLabel>
				</CodeBlockTitle>
				<CodeBlockActions>
					<CodeBlockDownloadButton code={code} language={language} />
					<CodeBlockCopyButton code={code} />
				</CodeBlockActions>
			</CodeBlockHeader>
		</CodeBlock>
	);
};
