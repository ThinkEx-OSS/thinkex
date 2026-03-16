"use client"

import { forwardRef, useCallback, useEffect, useState } from "react"
import type { Editor } from "@tiptap/react"

// --- Hooks ---
import { useIsBreakpoint } from "@/hooks/use-is-breakpoint"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Icons ---
import { CornerDownLeft, Link } from "lucide-react"




// --- Tiptap UI ---
import type { UseLinkPopoverConfig } from "@/components/tiptap-ui/link-popover"
import { useLinkPopover } from "@/components/tiptap-ui/link-popover"

// --- UI ---
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import "./link-popover.scss"

export interface LinkMainProps {
  /**
   * The URL to set for the link.
   */
  url: string
  /**
   * Function to update the URL state.
   */
  setUrl: React.Dispatch<React.SetStateAction<string | null>>
  /**
   * Function to set the link in the editor.
   */
  setLink: () => void
  /**
   * Function to remove the link from the editor.
   */
  removeLink: () => void
  /**
   * Function to open the link.
   */
  openLink: () => void
  /**
   * Whether the link is currently active in the editor.
   */
  isActive: boolean
}

export interface LinkPopoverProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type">,
    UseLinkPopoverConfig {
  /**
   * Callback for when the popover opens or closes.
   */
  onOpenChange?: (isOpen: boolean) => void
  /**
   * Whether to automatically open the popover when a link is active.
   * @default true
   */
  autoOpenOnLinkActive?: boolean
}

/**
 * Link button component for triggering the link popover
 */
export const LinkButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(
  ({ className, children, ...props }, ref) => {
    return (
      <button
        type="button"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "h-8 gap-1.5 rounded-md px-2.5 text-sm shadow-none",
          "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
          className
        )}
        role="button"
        tabIndex={-1}
        aria-label="Link"
        title="Link"
        ref={ref}
        {...props}
      >
        {children || <Link className="tiptap-button-icon" />}
      </button>
    )
  }
)

LinkButton.displayName = "LinkButton"

/**
 * Main content component for the link popover
 */
const LinkMain: React.FC<LinkMainProps> = ({
  url,
  setUrl,
  setLink,
  removeLink,
  openLink,
  isActive,
}) => {
  const isMobile = useIsBreakpoint()

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      setLink()
    }
  }

  return (
    <div className="flex min-w-max flex-row items-center gap-1">
      <Input
        type="url"
        placeholder="Paste a link..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        className="tiptap-link-input h-8 text-sm shadow-none"
      />

      <Button
        type="button"
        onClick={setLink}
        title="Apply link"
        disabled={!url && !isActive}
        variant="ghost"
        size="icon-sm"
      >
        <CornerDownLeft className="tiptap-button-icon" />
      </Button>
    </div>
  )
}

/**
 * Link content component for standalone use
 */
export const LinkContent: React.FC<{
  editor?: Editor | null
}> = ({ editor }) => {
  const linkPopover = useLinkPopover({
    editor,
  })

  return <LinkMain {...linkPopover} />
}

/**
 * Link popover component for Tiptap editors.
 *
 * For custom popover implementations, use the `useLinkPopover` hook instead.
 */
export const LinkPopover = forwardRef<HTMLButtonElement, LinkPopoverProps>(
  (
    {
      editor: providedEditor,
      hideWhenUnavailable = false,
      onSetLink,
      onOpenChange,
      autoOpenOnLinkActive = true,
      onClick,
      children,
      ...buttonProps
    },
    ref
  ) => {
    const { editor } = useTiptapEditor(providedEditor)
    const [isOpen, setIsOpen] = useState(false)

    const {
      isVisible,
      canSet,
      isActive,
      url,
      setUrl,
      setLink,
      removeLink,
      openLink,
      label,
      Icon,
    } = useLinkPopover({
      editor,
      hideWhenUnavailable,
      onSetLink,
    })

    const handleOnOpenChange = useCallback(
      (nextIsOpen: boolean) => {
        setIsOpen(nextIsOpen)
        onOpenChange?.(nextIsOpen)
      },
      [onOpenChange]
    )

    const handleSetLink = useCallback(() => {
      setLink()
      setIsOpen(false)
    }, [setLink])

    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        setIsOpen(!isOpen)
      },
      [onClick, isOpen]
    )

    useEffect(() => {
      if (autoOpenOnLinkActive && isActive) {
        setIsOpen(true)
      }
    }, [autoOpenOnLinkActive, isActive])

    if (!isVisible) {
      return null
    }

    return (
      <Popover open={isOpen} onOpenChange={handleOnOpenChange}>
        <PopoverTrigger asChild>
          <LinkButton
            disabled={!canSet}
            data-active-state={isActive ? "on" : "off"}
            data-disabled={!canSet}
            aria-label={label}
            aria-pressed={isActive}
            onClick={handleClick}
            {...buttonProps}
            ref={ref}
          >
            {children ?? <Icon className="tiptap-button-icon" />}
          </LinkButton>
        </PopoverTrigger>

        <PopoverContent>
          <LinkMain
            url={url}
            setUrl={setUrl}
            setLink={handleSetLink}
            removeLink={removeLink}
            openLink={openLink}
            isActive={isActive}
          />
        </PopoverContent>
      </Popover>
    )
  }
)

LinkPopover.displayName = "LinkPopover"

export default LinkPopover
