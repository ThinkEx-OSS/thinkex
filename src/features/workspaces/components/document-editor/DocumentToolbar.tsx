import type { Editor } from "@tiptap/react";
import { Check, Download, EllipsisVertical, FileText, Redo2, Undo2 } from "lucide-react";
import type { ReactNode } from "react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import {
	type DocumentEditorUiState,
	getActiveInlineFormat,
	useDocumentEditorUiState,
} from "#/features/workspaces/components/document-editor/document-editor-state";
import {
	type DocumentToolbarAction,
	documentBlockActions,
	documentFontSizeActions,
	documentInlineActions,
	documentTextAlignActions,
	getFontSizeIcon,
	getInlineMarkIcon,
	getStructureBlockIcon,
	getTextAlignIcon,
	isCodeBlock,
} from "#/features/workspaces/components/document-editor/document-editor-toolbar-actions";
import {
	WorkspaceToolbarGroup,
	WorkspaceToolbarIconButton,
} from "#/features/workspaces/components/WorkspaceToolbar";

export function DocumentToolbar({ editor }: { editor: Editor | null }) {
	const editorState = useDocumentEditorUiState(editor);

	return (
		<WorkspaceToolbarGroup scrollable>
			<BlockTypeMenu editor={editor} editorState={editorState} />
			<InlineFormatMenu editor={editor} editorState={editorState} />
			<AlignMenu editor={editor} editorState={editorState} />
			<ToolbarButton
				label="Undo"
				disabled={!editorState.canUndo}
				onClick={() => editor?.chain().focus().undo().run()}
			>
				<Undo2 />
			</ToolbarButton>
			<ToolbarButton
				label="Redo"
				disabled={!editorState.canRedo}
				onClick={() => editor?.chain().focus().redo().run()}
			>
				<Redo2 />
			</ToolbarButton>
			<DocumentMoreMenu disabled={!editor} />
		</WorkspaceToolbarGroup>
	);
}

function BlockTypeMenu({
	editor,
	editorState,
}: {
	editor: Editor | null;
	editorState: DocumentEditorUiState;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<WorkspaceToolbarIconButton disabled={!editor} aria-label="Text block" />}
			>
				{editorState.block.kind === "structure" ? (
					getStructureBlockIcon(editorState.block.type)
				) : (
					<span className="truncate">{getFontSizeIcon(editorState.block.size)}</span>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-44">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Text style</DropdownMenuLabel>
					{documentFontSizeActions.map((action) => (
						<DocumentMenuAction
							key={action.id}
							action={action}
							editor={editor}
							editorState={editorState}
						/>
					))}
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				{documentBlockActions.map((action) => (
					<DocumentMenuAction
						key={action.id}
						action={action}
						editor={editor}
						editorState={editorState}
					/>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function AlignMenu({
	editor,
	editorState,
}: {
	editor: Editor | null;
	editorState: DocumentEditorUiState;
}) {
	const disabled = !editor || isCodeBlock(editorState);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<WorkspaceToolbarIconButton disabled={disabled} aria-label="Text alignment" />}
			>
				{getTextAlignIcon(editorState.textAlign)}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-44">
				{documentTextAlignActions.map((action) => (
					<DocumentMenuAction
						key={action.id}
						action={action}
						editor={editor}
						editorState={editorState}
					/>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function InlineFormatMenu({
	editor,
	editorState,
}: {
	editor: Editor | null;
	editorState: DocumentEditorUiState;
}) {
	const activeFormat = getActiveInlineFormat(editorState.inlineMarks);
	const disabled = !editor || isCodeBlock(editorState);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<WorkspaceToolbarIconButton
						className={activeFormat ? "text-foreground" : undefined}
						disabled={disabled}
						aria-label="Text formatting"
					/>
				}
			>
				{activeFormat ? getInlineMarkIcon(activeFormat) : getInlineMarkIcon("bold")}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-44">
				{documentInlineActions.map((action) => (
					<DocumentMenuAction
						key={action.id}
						action={action}
						editor={editor}
						editorState={editorState}
					/>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function DocumentMenuAction({
	action,
	editor,
	editorState,
}: {
	action: DocumentToolbarAction;
	editor: Editor | null;
	editorState: DocumentEditorUiState;
}) {
	const active = action.active?.(editorState) ?? false;
	const disabled = !editor || (action.disabled?.(editorState) ?? false);

	return (
		<DropdownMenuItem
			className="[&_svg:not([class*='size-'])]:size-4"
			disabled={disabled}
			onClick={() => {
				if (editor && !disabled) {
					action.run(editor);
				}
			}}
		>
			<span className="inline-flex size-4 items-center justify-center text-muted-foreground">
				{action.icon}
			</span>
			{action.label}
			{active ? <Check className="ml-auto size-3.5 text-muted-foreground" /> : null}
		</DropdownMenuItem>
	);
}

function DocumentMoreMenu({ disabled }: { disabled?: boolean }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<WorkspaceToolbarIconButton disabled={disabled} aria-label="More document actions" />
				}
			>
				<EllipsisVertical />
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-48" align="end">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Export</DropdownMenuLabel>
					<DropdownMenuItem className="[&_svg:not([class*='size-'])]:size-4" disabled>
						<span className="inline-flex size-4 items-center justify-center text-muted-foreground">
							<Download />
						</span>
						PDF
						<span className="ml-auto text-xs text-muted-foreground">Soon</span>
					</DropdownMenuItem>
					<DropdownMenuItem className="[&_svg:not([class*='size-'])]:size-4" disabled>
						<span className="inline-flex size-4 items-center justify-center text-muted-foreground">
							<FileText />
						</span>
						Google Docs
						<span className="ml-auto text-xs text-muted-foreground">Soon</span>
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ToolbarButton({
	children,
	disabled,
	label,
	onClick,
}: {
	children: ReactNode;
	disabled?: boolean;
	label: string;
	onClick?: () => void;
}) {
	const button = (
		<WorkspaceToolbarIconButton disabled={disabled} aria-label={label} onClick={onClick}>
			{children}
		</WorkspaceToolbarIconButton>
	);

	return (
		<Tooltip>
			<TooltipTrigger render={button} />
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
