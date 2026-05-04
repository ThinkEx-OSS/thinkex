"use client"

import { forwardRef, useMemo, useRef, useState } from "react"
import { type Editor } from "@tiptap/react"

// --- Hooks ---
import { useMenuNavigation } from "@/hooks/use-menu-navigation"
import { useIsBreakpoint } from "@/hooks/use-is-breakpoint"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Icons ---
import { Ban, Highlighter } from "lucide-react"

// --- UI ---
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// --- Tiptap UI ---
import type {
  HighlightColor,
  UseColorHighlightConfig,
} from "@/components/tiptap-ui/color-highlight-button"
import {
  ColorHighlightButton,
  pickHighlightColorsByValue,
  useColorHighlight,
} from "@/components/tiptap-ui/color-highlight-button"

export interface ColorHighlightPopoverContentProps {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null
  /**
   * Optional colors to use in the highlight popover.
   * If not provided, defaults to a predefined set of colors.
   */
  colors?: HighlightColor[]
  /**
   * When true, uses the actual color value (colorValue) instead of CSS variable (value).
   * @default false
   */
  useColorValue?: boolean
}

export interface ColorHighlightPopoverProps
  extends
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type">,
    Pick<
      UseColorHighlightConfig,
      "editor" | "hideWhenUnavailable" | "onApplied"
    > {
  /**
   * Optional colors to use in the highlight popover.
   * If not provided, defaults to a predefined set of colors.
   */
  colors?: HighlightColor[]
  /**
   * When true, uses the actual color value (colorValue) instead of CSS variable (value).
   * @default false
   */
  useColorValue?: boolean
}

export const ColorHighlightPopoverButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => (
  <button
    type="button"
    className={cn(
      buttonVariants({ variant: "ghost", size: "sm" }),
      "h-6.5 gap-0.5 rounded-md px-1.5 text-[11px] text-muted-foreground hover:text-foreground shadow-none",
      "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-3.5",
      className
    )}
    role="button"
    tabIndex={-1}
    aria-label="Highlight text"
    title="Highlight"
    ref={ref}
    {...props}
  >
    {children ?? <Highlighter className="tiptap-button-icon" />}
  </button>
))

ColorHighlightPopoverButton.displayName = "ColorHighlightPopoverButton"

export function ColorHighlightPopoverContent({
  editor,
  colors = pickHighlightColorsByValue([
    "var(--tt-color-highlight-green)",
    "var(--tt-color-highlight-blue)",
    "var(--tt-color-highlight-red)",
    "var(--tt-color-highlight-purple)",
    "var(--tt-color-highlight-yellow)",
  ]),
  useColorValue = false,
}: ColorHighlightPopoverContentProps) {
  const { handleRemoveHighlight } = useColorHighlight({ editor })
  const containerRef = useRef<HTMLDivElement>(null)

  const menuItems = useMemo(
    () => [...colors, { label: "Remove highlight", value: "none" }],
    [colors]
  )

  const { selectedIndex } = useMenuNavigation({
    containerRef,
    items: menuItems,
    orientation: "both",
    onSelect: (item) => {
      if (!containerRef.current) return false
      const highlightedElement = containerRef.current.querySelector(
        '[data-highlighted="true"]'
      ) as HTMLElement
      if (highlightedElement) highlightedElement.click()
      if (item.value === "none") handleRemoveHighlight()
      return true
    },
    autoSelectFirstItem: false,
  })

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="flex min-w-max flex-row items-center gap-1"
    >
      {colors.map((color, index) => (
        <ColorHighlightButton
          key={color.value}
          editor={editor}
          highlightColor={useColorValue ? color.colorValue : color.value}
          aria-label={`${color.label} highlight color`}
          tabIndex={index === selectedIndex ? 0 : -1}
          data-highlighted={selectedIndex === index}
          useColorValue={useColorValue}
        />
      ))}
      <Button
        onClick={handleRemoveHighlight}
        aria-label="Remove highlight"
        tabIndex={selectedIndex === colors.length ? 0 : -1}
        type="button"
        role="menuitem"
        variant="ghost"
        size="icon-sm"
        data-highlighted={selectedIndex === colors.length}
      >
        <Ban className="tiptap-button-icon" />
      </Button>
    </div>
  )
}

export function ColorHighlightPopover({
  editor: providedEditor,
  colors = pickHighlightColorsByValue([
    "var(--tt-color-highlight-green)",
    "var(--tt-color-highlight-blue)",
    "var(--tt-color-highlight-red)",
    "var(--tt-color-highlight-purple)",
    "var(--tt-color-highlight-yellow)",
  ]),
  hideWhenUnavailable = false,
  useColorValue = false,
  onApplied,
  ...props
}: ColorHighlightPopoverProps) {
  const { editor } = useTiptapEditor(providedEditor)
  const [isOpen, setIsOpen] = useState(false)
  const { isVisible, canColorHighlight, isActive, label, Icon } =
    useColorHighlight({
      editor,
      hideWhenUnavailable,
      onApplied,
    })

  if (!isVisible) return null

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <ColorHighlightPopoverButton
          disabled={!canColorHighlight}
          data-active-state={isActive ? "on" : "off"}
          data-disabled={!canColorHighlight}
          aria-pressed={isActive}
          aria-label={label}
          title={label}
          {...props}
        >
          <Icon className="tiptap-button-icon" />
        </ColorHighlightPopoverButton>
      </PopoverTrigger>
      <PopoverContent aria-label="Highlight colors" className="w-auto p-2">
        <ColorHighlightPopoverContent
          editor={editor}
          colors={colors}
          useColorValue={useColorValue}
        />
      </PopoverContent>
    </Popover>
  )
}

export default ColorHighlightPopover
