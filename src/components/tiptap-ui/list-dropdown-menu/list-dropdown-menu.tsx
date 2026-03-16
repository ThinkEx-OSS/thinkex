"use client"

import { useCallback, useState } from "react"
import { type Editor } from "@tiptap/react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Icons ---
import { ChevronDown } from "lucide-react"

// --- Tiptap UI ---
import { ListButton, type ListType } from "@/components/tiptap-ui/list-button"

import { useListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu/use-list-dropdown-menu"

// --- UI ---
import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export interface ListDropdownMenuProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor
  /**
   * The list types to display in the dropdown.
   */
  types?: ListType[]
  /**
   * Whether the dropdown should be hidden when no list types are available
   * @default false
   */
  hideWhenUnavailable?: boolean
  /**
   * Callback for when the dropdown opens or closes
   */
  onOpenChange?: (isOpen: boolean) => void
  /**
   * Whether the dropdown should use a modal
   */
  modal?: boolean
}

export function ListDropdownMenu({
  editor: providedEditor,
  types = ["bulletList", "orderedList", "taskList"],
  hideWhenUnavailable = false,
  onOpenChange,
  modal = true,
  ...props
}: ListDropdownMenuProps) {
  const { editor } = useTiptapEditor(providedEditor)
  const [isOpen, setIsOpen] = useState(false)

  const { filteredLists, canToggle, isActive, isVisible, Icon } =
    useListDropdownMenu({
      editor,
      types,
      hideWhenUnavailable,
    })

  const handleOnOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open)
      onOpenChange?.(open)
    },
    [onOpenChange]
  )

  if (!isVisible) {
    return null
  }

  return (
    <DropdownMenu modal={modal} open={isOpen} onOpenChange={handleOnOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-active-state={isActive ? "on" : "off"}
          role="button"
          tabIndex={-1}
          disabled={!canToggle}
          data-disabled={!canToggle}
          aria-label="List options"
          title="List"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "h-8 gap-1.5 rounded-md px-2.5 text-sm shadow-none",
            "data-[active-state=on]:bg-accent data-[active-state=on]:text-accent-foreground",
            "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
            "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
            "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
            "[&_.tiptap-button-dropdown-small]:opacity-70"
          )}
          {...props}
        >
          <Icon className="tiptap-button-icon" />
          <ChevronDown className="tiptap-button-dropdown-small" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          {filteredLists.map((option) => (
            <DropdownMenuItem key={option.type} asChild>
              <ListButton
                editor={editor}
                type={option.type}
                text={option.label}
                showTooltip={false}
              />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ListDropdownMenu
