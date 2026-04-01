"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import {
  EditorContent,
  EditorContext,
  findParentNodeClosestToPos,
  useEditor,
  useEditorState,
} from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";

// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TextAlign } from "@tiptap/extension-text-align";
import { Typography } from "@tiptap/extension-typography";
import { Highlight } from "@tiptap/extension-highlight";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Selection } from "@tiptap/extensions";
import { Mathematics } from "@tiptap/extension-mathematics";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import { CustomCodeBlock } from "@/components/tiptap-node/code-block-node/code-block-extension";
import "katex/dist/katex.min.css";

// --- UI ---
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";

// --- Tiptap Hooks ---
import { useHeading } from "@/components/tiptap-ui/heading-button";
import { useHeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu";
import { useList } from "@/components/tiptap-ui/list-button";
import { useListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu/use-list-dropdown-menu";
import { useBlockquote } from "@/components/tiptap-ui/blockquote-button";
import { useCodeBlock } from "@/components/tiptap-ui/code-block-button";
import { useMark } from "@/components/tiptap-ui/mark-button";
import { useTextAlign } from "@/components/tiptap-ui/text-align-button";
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from "@/components/tiptap-ui/color-highlight-popover";

// --- Tiptap Node ---
import { ImageUploadNode } from "@/components/tiptap-node/image-upload-node/image-upload-node-extension";
import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension";
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss";
import "@/components/tiptap-node/code-block-node/code-block-node.scss";
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss";
import "@/components/tiptap-node/list-node/list-node.scss";
import "@/components/tiptap-node/image-node/image-node.scss";
import "@/components/tiptap-node/heading-node/heading-node.scss";
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss";

// --- Tiptap UI ---
import type { Level } from "@/components/tiptap-ui/heading-button";
import type { ListType } from "@/components/tiptap-ui/list-button";
import type { Mark } from "@/components/tiptap-ui/mark-button";
import type { TextAlign as TextAlignType } from "@/components/tiptap-ui/text-align-button";

// --- Icons ---
import {
  ArrowLeft,
  Highlighter,
  AlignLeft,
  AlignCenter,
  Code2,
  Type,
  Sigma,
  Trash2,
  Table as TableIcon,
  Settings,
} from "lucide-react";
import { FaQuoteRight } from "react-icons/fa6";

// --- Hooks ---
import { useIsBreakpoint } from "@/hooks/use-is-breakpoint";
import { useWindowSize } from "@/hooks/use-window-size";
import { useCursorVisibility } from "@/hooks/use-cursor-visibility";

// --- Components ---
import { EditorThemeToggle } from "@/components/editor/EditorThemeToggle";

// --- Lib ---
import {
  cn,
  extractSelectionTextForAskAI,
  handleImageUpload,
  MAX_FILE_SIZE,
} from "@/lib/tiptap-utils";
import { useUIStore } from "@/lib/stores/ui-store";
import { focusComposerInput } from "@/lib/utils/composer-utils";
import { toast } from "sonner";

// --- Math Edit Dialog (MathLive) ---
import { MathEditDialog } from "@/components/editor/MathEditDialog";

// --- Styles ---
import "@/components/editor/document-editor.scss";

export interface DocumentEditorUpdate {
  json: JSONContent;
  text: string;
  markdown: string;
}

interface DocumentEditorProps {
  autofocus?: boolean;
  cardName?: string;
  className?: string;
  content?: JSONContent | string;
  contentClassName?: string;
  contentType?: "json" | "markdown";
  editorClassName?: string;
  embedded?: boolean;
  onUpdate?: (update: DocumentEditorUpdate) => void;
  showThemeToggle?: boolean;
}

const EMPTY_DOCUMENT_JSON: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const HEADING_LEVELS: Level[] = [1, 2, 3];
const LIST_TYPES: ListType[] = ["bulletList", "orderedList", "taskList"];
const INLINE_MARKS: Mark[] = ["bold", "italic", "underline"];
const SCRIPT_MARKS: Mark[] = ["superscript", "subscript"];
const TEXT_ALIGN_OPTIONS: TextAlignType[] = [
  "left",
  "center",
  "right",
  "justify",
];

const toolbarButtonClass = "h-8 gap-1.5 rounded-md px-2.5 text-sm shadow-none";

function ToolbarIconButton({
  active = false,
  className,
  title,
  ...props
}: React.ComponentProps<typeof Button> & {
  active?: boolean;
  title: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      title={title}
      aria-label={title}
      data-active-state={active ? "on" : "off"}
      className={cn(toolbarButtonClass, className)}
      {...props}
    />
  );
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function InlineMarkToolbarButton({
  editor,
  type,
}: {
  editor: Editor | null;
  type: Mark;
}) {
  const { isVisible, isActive, canToggle, handleMark, label, Icon } = useMark({
    editor,
    type,
  });

  if (!isVisible) return null;

  return (
    <ToolbarIconButton
      type="button"
      active={isActive}
      disabled={!canToggle}
      aria-pressed={isActive}
      title={label}
      onClick={handleMark}
    >
      <Icon className="tiptap-button-icon" />
    </ToolbarIconButton>
  );
}

function HeadingMenuItem({
  editor,
  level,
}: {
  editor: Editor | null;
  level: Level;
}) {
  const { isVisible, isActive, canToggle, handleToggle, label, Icon } =
    useHeading({
      editor,
      level,
    });

  if (!isVisible) return null;

  const fontSizes: Record<Level, string> = {
    1: "24px",
    2: "20px",
    3: "18px",
    4: "16px",
    5: "14px",
    6: "12px",
  };

  return (
    <DropdownMenuItem
      disabled={!canToggle}
      onSelect={() => {
        handleToggle();
      }}
      className={cn(isActive && "bg-accent")}
    >
      <Icon className="size-4" />
      <span>{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">
        {fontSizes[level]}
      </span>
    </DropdownMenuItem>
  );
}

function ListMenuItem({
  editor,
  type,
}: {
  editor: Editor | null;
  type: ListType;
}) {
  const { isVisible, isActive, canToggle, handleToggle, label, Icon } = useList(
    {
      editor,
      type,
    },
  );

  if (!isVisible) return null;

  return (
    <DropdownMenuItem
      disabled={!canToggle}
      onSelect={() => {
        handleToggle();
      }}
      className={cn(isActive && "bg-accent")}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </DropdownMenuItem>
  );
}

function ParagraphMenuItem({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const isActive = editor.isActive("paragraph");
  const canToggle =
    !isActive &&
    (editor.can().setNode("paragraph") || editor.can().clearNodes());

  return (
    <DropdownMenuItem
      disabled={!canToggle && !isActive}
      onSelect={() => {
        editor.chain().focus().clearNodes().run();
      }}
      className={cn(isActive && "bg-accent")}
    >
      <AlignLeft className="size-4 shrink-0 text-muted-foreground" />
      <span>Paragraph</span>
      <span className="ml-auto text-xs text-muted-foreground">16px</span>
    </DropdownMenuItem>
  );
}

function BlockquoteMenuItem({ editor }: { editor: Editor | null }) {
  const { isVisible, isActive, canToggle, handleToggle, label, Icon } =
    useBlockquote({
      editor,
    });

  if (!isVisible) return null;

  return (
    <DropdownMenuItem
      disabled={!canToggle}
      onSelect={() => {
        handleToggle();
      }}
      className={cn(isActive && "bg-accent")}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </DropdownMenuItem>
  );
}

function CodeBlockMenuItem({ editor }: { editor: Editor | null }) {
  const { isVisible, isActive, canToggle, handleToggle, label, Icon } =
    useCodeBlock({
      editor,
    });

  if (!isVisible) return null;

  return (
    <DropdownMenuItem
      disabled={!canToggle}
      onSelect={() => {
        handleToggle();
      }}
      className={cn(isActive && "bg-accent")}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </DropdownMenuItem>
  );
}

function TableMenuItem({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const canInsert = editor
    .can()
    .insertTable({ rows: 3, cols: 3, withHeaderRow: true });

  return (
    <DropdownMenuItem
      disabled={!canInsert}
      onSelect={() => {
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run();
      }}
    >
      <TableIcon className="size-4" />
      <span>Table</span>
    </DropdownMenuItem>
  );
}

function ScriptMenuItem({
  editor,
  type,
}: {
  editor: Editor | null;
  type: Mark;
}) {
  const { isVisible, isActive, canToggle, handleMark, label, Icon } = useMark({
    editor,
    type,
  });

  if (!isVisible) return null;

  return (
    <DropdownMenuItem
      disabled={!canToggle}
      onSelect={() => {
        handleMark();
      }}
      className={cn(isActive && "bg-accent")}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </DropdownMenuItem>
  );
}

function AlignMenuItem({
  editor,
  align,
}: {
  editor: Editor | null;
  align: TextAlignType;
}) {
  const { isVisible, isActive, canAlign, handleTextAlign, label, Icon } =
    useTextAlign({
      editor,
      align,
    });

  if (!isVisible) return null;

  return (
    <DropdownMenuItem
      disabled={!canAlign}
      onSelect={() => {
        handleTextAlign();
      }}
      className={cn(isActive && "bg-accent")}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </DropdownMenuItem>
  );
}

function BlocksDropdown({ editor }: { editor: Editor | null }) {
  const heading = useHeadingDropdownMenu({
    editor,
    levels: HEADING_LEVELS,
  });
  const list = useListDropdownMenu({
    editor,
    types: LIST_TYPES,
  });
  const blockquote = useBlockquote({ editor });
  const codeBlock = useCodeBlock({ editor });

  const isFormatActive = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null;
      return (
        editor.isActive("codeBlock") ||
        editor.isActive("blockquote") ||
        editor.isActive("paragraph") ||
        HEADING_LEVELS.some((level) => editor.isActive("heading", { level })) ||
        LIST_TYPES.some((type) => editor.isActive(type))
      );
    },
  });

  if (
    !heading.isVisible &&
    !list.isVisible &&
    !blockquote.isVisible &&
    !codeBlock.isVisible
  ) {
    return null;
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Format"
          data-active-state={isFormatActive ? "on" : "off"}
          className={cn(toolbarButtonClass, "min-w-0")}
        >
          <Type className="tiptap-button-icon" />
          <span className="hidden sm:inline">Format</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          {HEADING_LEVELS.map((level) => (
            <HeadingMenuItem key={level} editor={editor} level={level} />
          ))}
          <ParagraphMenuItem editor={editor} />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Lists</DropdownMenuLabel>
        <DropdownMenuGroup>
          {LIST_TYPES.map((type) => (
            <ListMenuItem key={type} editor={editor} type={type} />
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <BlockquoteMenuItem editor={editor} />
          <CodeBlockMenuItem editor={editor} />
          <TableMenuItem editor={editor} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MathDropdown({ editor }: { editor: Editor | null }) {
  const superscript = useMark({ editor, type: "superscript" });
  const subscript = useMark({ editor, type: "subscript" });

  const isMathActive = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null;
      return editor.isActive("subscript") || editor.isActive("superscript");
    },
  });

  if (!superscript.isVisible && !subscript.isVisible) return null;

  const handleInlineMath = () => {
    if (!editor) return;
    const latex = prompt("Enter LaTeX formula:");
    if (latex !== null && latex.trim()) {
      editor.chain().focus().insertInlineMath({ latex }).run();
    }
  };

  const handleBlockMath = () => {
    if (!editor) return;
    const latex = prompt("Enter LaTeX formula:");
    if (latex !== null && latex.trim()) {
      editor.chain().focus().insertBlockMath({ latex }).run();
    }
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Math"
          data-active-state={isMathActive ? "on" : "off"}
          className={cn(toolbarButtonClass, "min-w-0")}
        >
          <Sigma className="tiptap-button-icon" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={handleInlineMath}>
            <Sigma className="size-4" />
            <span>Inline Math</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleBlockMath}>
            <Sigma className="size-4" />
            <span>Block Math</span>
          </DropdownMenuItem>
          {SCRIPT_MARKS.map((type) => (
            <ScriptMenuItem key={type} editor={editor} type={type} />
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AlignDropdown({ editor }: { editor: Editor | null }) {
  const left = useTextAlign({ editor, align: "left" });
  const center = useTextAlign({ editor, align: "center" });
  const right = useTextAlign({ editor, align: "right" });
  const justify = useTextAlign({ editor, align: "justify" });

  const isAlignActive = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null;
      return (
        editor.isActive({ textAlign: "left" }) ||
        editor.isActive({ textAlign: "center" }) ||
        editor.isActive({ textAlign: "right" }) ||
        editor.isActive({ textAlign: "justify" })
      );
    },
  });

  if (
    !left.isVisible &&
    !center.isVisible &&
    !right.isVisible &&
    !justify.isVisible
  ) {
    return null;
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Text align"
          data-active-state={isAlignActive ? "on" : "off"}
          className={cn(
            toolbarButtonClass,
            "justify-center font-medium [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
            "min-w-0",
          )}
        >
          <AlignLeft className="tiptap-button-icon" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          {TEXT_ALIGN_OPTIONS.map((align) => (
            <AlignMenuItem key={align} editor={editor} align={align} />
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TableControls({ editor }: { editor: Editor | null }) {
  const isInTable = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return false;
      return editor.isActive("table");
    },
  });

  if (!editor || !isInTable) return null;

  return (
    <>
      <Separator orientation="vertical" className="h-5" />
      <ToolbarGroup>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title="Table Options"
              className={cn(toolbarButtonClass, "min-w-0")}
            >
              <Settings className="size-4" />
              <span className="text-xs font-medium">Table</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Columns</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() => editor.chain().focus().addColumnBefore().run()}
              >
                <span>Add Column Before</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => editor.chain().focus().addColumnAfter().run()}
              >
                <span>Add Column After</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => editor.chain().focus().deleteColumn().run()}
              >
                <span>Delete Column</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Rows</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() => editor.chain().focus().addRowBefore().run()}
              >
                <span>Add Row Before</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => editor.chain().focus().addRowAfter().run()}
              >
                <span>Add Row After</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => editor.chain().focus().deleteRow().run()}
              >
                <span>Delete Row</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() => editor.chain().focus().deleteTable().run()}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" />
                <span>Delete Table</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>
    </>
  );
}

function AskAiBubbleMenu({
  editor,
  cardName,
}: {
  editor: Editor | null;
  cardName?: string;
}) {
  const addReplySelection = useUIStore((state) => state.addReplySelection);

  const handleAskAI = useCallback(() => {
    if (!editor) return;

    const { empty, to } = editor.state.selection;
    if (empty) return;

    const text = extractSelectionTextForAskAI(editor);
    if (!text) return;

    addReplySelection({
      text,
      title: cardName,
    });
    editor.chain().focus().setTextSelection(to).run();
    toast.success("Added to context");
    focusComposerInput();
  }, [editor, addReplySelection, cardName]);

  if (!editor) return null;

  return (
    <BubbleMenu
      editor={editor}
      updateDelay={100}
      shouldShow={({ state }) => {
        const { selection } = state;
        if (selection.empty) return false;
        return Boolean(extractSelectionTextForAskAI(editor)?.trim());
      }}
      options={{
        placement: "bottom-end",
        offset: 6,
        shift: {
          padding: 8,
        },
        inline: true,
      }}
    >
      <div className="flex items-center rounded-full p-0.5">
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={handleAskAI}
          className="h-8 rounded-full border-0 !bg-blue-500 px-3 text-xs font-medium !text-white shadow-sm transition-colors hover:!bg-blue-600 hover:!text-white"
        >
          <FaQuoteRight className="size-3.5" />
          <span>Ask AI</span>
        </Button>
      </div>
    </BubbleMenu>
  );
}

const MainToolbarContent = ({
  editor,
  onHighlighterClick,
  isMobile,
  showThemeToggle,
}: {
  editor: Editor | null;
  onHighlighterClick: () => void;
  isMobile: boolean;
  showThemeToggle: boolean;
}) => {
  return (
    <div className="flex items-center">
      <ToolbarGroup>
        <BlocksDropdown editor={editor} />
      </ToolbarGroup>
      <Separator orientation="vertical" className="h-5" />
      <ToolbarGroup>
        {INLINE_MARKS.map((type) => (
          <InlineMarkToolbarButton key={type} editor={editor} type={type} />
        ))}
        {!isMobile ? (
          <ColorHighlightPopover editor={editor} />
        ) : (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        )}
      </ToolbarGroup>
      <ToolbarGroup>
        <MathDropdown editor={editor} />
        <AlignDropdown editor={editor} />
      </ToolbarGroup>
      <TableControls editor={editor} />
      {showThemeToggle ? (
        <>
          <Separator orientation="vertical" className="h-5" />
          <ToolbarGroup>
            <EditorThemeToggle />
          </ToolbarGroup>
        </>
      ) : null}
    </div>
  );
};

const MobileToolbarContent = ({
  editor,
  onBack,
}: {
  editor: Editor | null;
  onBack: () => void;
}) => (
  <div className="flex items-center">
    <ToolbarGroup>
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className={toolbarButtonClass}
      >
        <ArrowLeft className="tiptap-button-icon" />
        <Highlighter className="tiptap-button-icon" />
      </Button>
    </ToolbarGroup>
    <Separator orientation="vertical" className="h-5" />
    <ColorHighlightPopoverContent editor={editor} />
  </div>
);

export function DocumentEditor({
  autofocus = false,
  cardName,
  className,
  content,
  contentClassName,
  contentType,
  editorClassName,
  embedded = false,
  onUpdate,
  showThemeToggle = true,
}: DocumentEditorProps = {}) {
  const isMobile = useIsBreakpoint();
  const { height } = useWindowSize();
  const [mobileView, setMobileView] = useState<"main" | "highlighter">("main");
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const activeMobileView = isMobile ? mobileView : "main";

  // Stable ref so closures created inside useEditor always access the live editor
  const editorRef = useRef<Editor | null>(null);

  // Math dialog: single state object + stable open function via ref
  const [mathEdit, setMathEdit] = useState<{
    open: boolean;
    latex: string;
    title: string;
    pos: number;
    type: "inline" | "block";
  }>({ open: false, latex: "", title: "", pos: 0, type: "inline" });

  const openMathDialog = useCallback(
    (latex: string, pos: number, type: "inline" | "block") => {
      setMathEdit({
        open: true,
        latex,
        title: type === "inline" ? "Edit Inline Math" : "Edit Block Math",
        pos,
        type,
      });
    },
    [],
  );

  const closeMathDialog = useCallback(() => {
    setMathEdit((prev) => ({ ...prev, open: false }));
  }, []);

  const handleMathSave = useCallback((latex: string) => {
    const ed = editorRef.current;
    if (!ed) return;
    setMathEdit((prev) => {
      if (prev.type === "inline") {
        ed.chain()
          .setNodeSelection(prev.pos)
          .updateInlineMath({ latex })
          .focus()
          .run();
      } else {
        ed.chain()
          .setNodeSelection(prev.pos)
          .updateBlockMath({ latex })
          .focus()
          .run();
      }
      return { ...prev, open: false };
    });
  }, []);

  const editor = useEditor({
    autofocus,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        "aria-label": "Main content area, start typing to enter text.",
        class: cn(
          "simple-editor",
          embedded && "simple-editor-embedded",
          editorClassName,
        ),
      },
    },
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
        codeBlock: false,
        link: {
          openOnClick: true,
        },
      }),
      CustomCodeBlock.configure({
        defaultLanguage: "text",
        enableTabIndentation: true,
        tabSize: 2,
      }),
      HorizontalRule,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Image.configure({
        resize: {
          enabled: true,
          minWidth: 100,
          minHeight: 100,
          alwaysPreserveAspectRatio: true,
        },
      }),
      Typography,
      Superscript,
      Subscript,
      Selection,
      Mathematics.configure({
        inlineOptions: {
          onClick: (node, pos) => {
            openMathDialog(node.attrs.latex || "", pos, "inline");
          },
        },
        blockOptions: {
          onClick: (node, pos) => {
            openMathDialog(node.attrs.latex || "", pos, "block");
          },
        },
        katexOptions: {
          throwOnError: false,
        },
      }),
      TableKit.configure({
        table: {
          resizable: false,
        },
      }),
      ImageUploadNode.configure({
        accept: "image/*",
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: handleImageUpload,
        onError: (error) => console.error("Upload failed:", error),
      }),
      Markdown.configure({
        markedOptions: {
          gfm: true,
        },
      }),
    ],
    ...(contentType === "markdown" && typeof content === "string"
      ? { content, contentType: "markdown" as const }
      : content
        ? { content }
        : {}),
    onUpdate: ({ editor }) => {
      const md =
        typeof editor.getMarkdown === "function" ? editor.getMarkdown() : "";
      onUpdate?.({
        json: editor.getJSON(),
        text: editor.state.doc.textBetween(
          0,
          editor.state.doc.content.size,
          "\n\n",
        ),
        markdown: md,
      });
    },
  });
  // Keep editorRef in sync so closures always have the live editor
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const updateToolbarHeight = () => {
      setToolbarHeight(toolbar.getBoundingClientRect().height);
    };

    const observer = new ResizeObserver(updateToolbarHeight);
    observer.observe(toolbar);

    return () => {
      observer.disconnect();
    };
  }, []);

  const rect = useCursorVisibility({
    editor,
    overlayHeight: toolbarHeight,
  });

  // Sync incoming content only when it actually differs from the live editor state.
  useEffect(() => {
    if (!editor) return;

    queueMicrotask(() => {
      if (contentType === "markdown" && typeof content === "string") {
        if (editor.getMarkdown?.() === content) return;
        editor.commands.setContent(content, {
          contentType: "markdown" as const,
          emitUpdate: false,
        });
        return;
      }

      const nextContent = content ?? EMPTY_DOCUMENT_JSON;
      if (JSON.stringify(editor.getJSON()) === JSON.stringify(nextContent))
        return;

      editor.commands.setContent(nextContent, { emitUpdate: false });
    });
  }, [editor, content, contentType]);

  return (
    <div
      className={cn(
        "simple-editor-wrapper",
        "relative",
        embedded && "simple-editor-wrapper-embedded",
        className,
      )}
    >
      <EditorContext.Provider value={{ editor }}>
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label="Editor toolbar"
          className={cn(
            "z-40 flex items-center gap-2 overflow-x-auto bg-sidebar",
            isMobile
              ? "absolute inset-x-0 rounded-none border border-x-0 border-b-0"
              : "sticky top-0 mx-auto w-fit max-w-[calc(100%-1.5rem)] rounded-b-lg",
          )}
          style={{
            ...(isMobile
              ? {
                  bottom: `calc(100% - ${height - rect.y}px)`,
                }
              : {}),
          }}
        >
          {activeMobileView === "main" ? (
            <MainToolbarContent
              editor={editor}
              onHighlighterClick={() => setMobileView("highlighter")}
              isMobile={isMobile}
              showThemeToggle={showThemeToggle}
            />
          ) : (
            <MobileToolbarContent
              editor={editor}
              onBack={() => setMobileView("main")}
            />
          )}
        </div>

        <AskAiBubbleMenu editor={editor} cardName={cardName} />

        <EditorContent
          editor={editor}
          role="presentation"
          className={cn(
            "simple-editor-content",
            embedded && "simple-editor-content-embedded",
            contentClassName,
          )}
        />
      </EditorContext.Provider>

      {/* MathLive dialog for editing math nodes */}
      <MathEditDialog
        open={mathEdit.open}
        onOpenChange={(open) => {
          if (!open) closeMathDialog();
        }}
        initialLatex={mathEdit.latex}
        onSave={handleMathSave}
        title={mathEdit.title}
      />
    </div>
  );
}
