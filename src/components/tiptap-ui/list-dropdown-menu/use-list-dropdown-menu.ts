"use client"

import { useMemo } from "react"
import type { Editor } from "@tiptap/react"
import { useEditorState } from "@tiptap/react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Icons ---
import { List, ListOrdered, ListTodo } from "lucide-react"

// --- Lib ---
import { isNodeInSchema } from "@/lib/tiptap-utils"

// --- Tiptap UI ---
import {
  canToggleList,
  isListActive,
  listIcons,
  type ListType,
} from "@/components/tiptap-ui/list-button"

/**
 * Configuration for the list dropdown menu functionality
 */
export interface UseListDropdownMenuConfig {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null
  /**
   * The list types to display in the dropdown.
   * @default ["bulletList", "orderedList", "taskList"]
   */
  types?: ListType[]
  /**
   * Whether the dropdown should be hidden when no list types are available
   * @default false
   */
  hideWhenUnavailable?: boolean
}

export interface ListOption {
  label: string
  type: ListType
  icon: React.ElementType
}

export const listOptions: ListOption[] = [
  {
    label: "Bullet",
    type: "bulletList",
    icon: List,
  },
  {
    label: "Ordered",
    type: "orderedList",
    icon: ListOrdered,
  },
  {
    label: "Task",
    type: "taskList",
    icon: ListTodo,
  },
]

export function canToggleAnyList(
  editor: Editor | null,
  listTypes: ListType[]
): boolean {
  if (!editor || !editor.isEditable) return false
  return listTypes.some((type) => canToggleList(editor, type))
}

export function isAnyListActive(
  editor: Editor | null,
  listTypes: ListType[]
): boolean {
  if (!editor || !editor.isEditable) return false
  return listTypes.some((type) => isListActive(editor, type))
}

export function getFilteredListOptions(
  availableTypes: ListType[]
): typeof listOptions {
  return listOptions.filter(
    (option) => !option.type || availableTypes.includes(option.type)
  )
}

export function shouldShowListDropdown(params: {
  editor: Editor | null
  listTypes: ListType[]
  hideWhenUnavailable: boolean
  listInSchema: boolean
  canToggleAny: boolean
}): boolean {
  const { editor, hideWhenUnavailable, listInSchema, canToggleAny } = params

  if (!editor) return false

  if (!hideWhenUnavailable) {
    return true
  }

  if (!listInSchema) return false

  if (!editor.isActive("code")) {
    return canToggleAny
  }

  return true
}

/**
 * Gets the currently active list type from the available types
 */
export function getActiveListType(
  editor: Editor | null,
  availableTypes: ListType[]
): ListType | undefined {
  if (!editor || !editor.isEditable) return undefined
  return availableTypes.find((type) => isListActive(editor, type))
}

/**
 * Custom hook that provides list dropdown menu functionality for Tiptap editor
 *
 * @example
 * ```tsx
 * // Simple usage
 * function MyListDropdown() {
 *   const {
 *     isVisible,
 *     activeType,
 *     isAnyActive,
 *     canToggleAny,
 *     filteredLists,
 *   } = useListDropdownMenu()
 *
 *   if (!isVisible) return null
 *
 *   return (
 *     <DropdownMenu>
 *       // dropdown content
 *     </DropdownMenu>
 *   )
 * }
 *
 * // Advanced usage with configuration
 * function MyAdvancedListDropdown() {
 *   const {
 *     isVisible,
 *     activeType,
 *   } = useListDropdownMenu({
 *     editor: myEditor,
 *     types: ["bulletList", "orderedList"],
 *     hideWhenUnavailable: true,
 *   })
 *
 *   // component implementation
 * }
 * ```
 */
export function useListDropdownMenu(config?: UseListDropdownMenuConfig) {
  const {
    editor: providedEditor,
    types = ["bulletList", "orderedList", "taskList"],
    hideWhenUnavailable = false,
  } = config || {}

  const { editor } = useTiptapEditor(providedEditor)
  const filteredLists = useMemo(() => getFilteredListOptions(types), [types])
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) {
        return {
          isVisible: true,
          canToggleAny: false,
          isAnyActive: false,
          activeType: undefined,
        }
      }

      const listInSchema = types.some((type) =>
        isNodeInSchema(type, currentEditor)
      )
      const canToggleAny = canToggleAnyList(currentEditor, types)

      return {
        isVisible: shouldShowListDropdown({
          editor: currentEditor,
          listTypes: types,
          hideWhenUnavailable,
          listInSchema,
          canToggleAny,
        }),
        canToggleAny,
        isAnyActive: isAnyListActive(currentEditor, types),
        activeType: getActiveListType(currentEditor, types),
      }
    },
  })!
  const {
    isVisible,
    canToggleAny,
    isAnyActive,
    activeType,
  } = toolbarState
  const activeList = filteredLists.find((option) => option.type === activeType)

  return {
    isVisible,
    activeType,
    isActive: isAnyActive,
    canToggle: canToggleAny,
    types,
    filteredLists,
    label: "List",
    Icon: activeList ? listIcons[activeList.type] : List,
  }
}
