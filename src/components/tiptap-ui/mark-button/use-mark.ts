"use client"

import { useCallback } from "react"
import type { Editor } from "@tiptap/react"
import { useEditorState } from "@tiptap/react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Lib ---
import { isMarkInSchema, isNodeTypeSelected } from "@/lib/tiptap-utils"

// --- Icons ---
import { Bold, Code2, Italic, Strikethrough, Subscript, Superscript, Underline } from "lucide-react"

export type Mark =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "underline"
  | "superscript"
  | "subscript"

/**
 * Configuration for the mark functionality
 */
export interface UseMarkConfig {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null
  /**
   * The type of mark to toggle
   */
  type: Mark
  /**
   * Whether the button should hide when mark is not available.
   * @default false
   */
  hideWhenUnavailable?: boolean
  /**
   * Callback function called after a successful mark toggle.
   */
  onToggled?: () => void
}

export const markIcons = {
  bold: Bold,
  italic: Italic,
  underline: Underline,
  strike: Strikethrough,
  code: Code2,
  superscript: Superscript,
  subscript: Subscript,
}

export const MARK_SHORTCUT_KEYS: Record<Mark, string> = {
  bold: "mod+b",
  italic: "mod+i",
  underline: "mod+u",
  strike: "mod+shift+s",
  code: "mod+e",
  superscript: "mod+.",
  subscript: "mod+,",
}

/**
 * Checks if a mark can be toggled in the current editor state
 */
export function canToggleMark(editor: Editor | null, type: Mark): boolean {
  if (!editor || !editor.isEditable) return false
  if (!isMarkInSchema(type, editor) || isNodeTypeSelected(editor, ["image"]))
    return false

  return editor.can().toggleMark(type)
}

/**
 * Checks if a mark is currently active
 */
export function isMarkActive(editor: Editor | null, type: Mark): boolean {
  if (!editor || !editor.isEditable) return false
  return editor.isActive(type)
}

/**
 * Toggles a mark in the editor
 */
export function toggleMark(editor: Editor | null, type: Mark): boolean {
  if (!editor || !editor.isEditable) return false
  if (!canToggleMark(editor, type)) return false

  return editor.chain().focus().toggleMark(type).run()
}

/**
 * Determines if the mark button should be shown
 */
export function shouldShowButton(props: {
  editor: Editor | null
  type: Mark
  hideWhenUnavailable: boolean
}): boolean {
  const { editor, type, hideWhenUnavailable } = props

  if (!editor) return false

  if (!hideWhenUnavailable) {
    return true
  }

  if (!editor.isEditable) return false

  if (!isMarkInSchema(type, editor)) return false

  if (!editor.isActive("code")) {
    return canToggleMark(editor, type)
  }

  return true
}

/**
 * Gets the formatted mark name
 */
export function getFormattedMarkName(type: Mark): string {
  return type.charAt(0).toUpperCase() + type.slice(1)
}

/**
 * Custom hook that provides mark functionality for Tiptap editor
 *
 * @example
 * ```tsx
 * // Simple usage
 * function MySimpleBoldButton() {
 *   const { isVisible, handleMark } = useMark({ type: "bold" })
 *
 *   if (!isVisible) return null
 *
 *   return <button onClick={handleMark}>Bold</button>
 * }
 *
 * // Advanced usage with configuration
 * function MyAdvancedItalicButton() {
 *   const { isVisible, handleMark, label, isActive } = useMark({
 *     editor: myEditor,
 *     type: "italic",
 *     hideWhenUnavailable: true,
 *     onToggled: () => console.log('Mark toggled!')
 *   })
 *
 *   if (!isVisible) return null
 *
 *   return (
 *     <MyButton
 *       onClick={handleMark}
 *       aria-pressed={isActive}
 *       aria-label={label}
 *     >
 *       Italic
 *     </MyButton>
 *   )
 * }
 * ```
 */
export function useMark(config: UseMarkConfig) {
  const {
    editor: providedEditor,
    type,
    hideWhenUnavailable = false,
    onToggled,
  } = config

  const { editor } = useTiptapEditor(providedEditor)
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) {
        return {
          isVisible: true,
          isActive: false,
          canToggle: false,
        }
      }

      return {
        isVisible: shouldShowButton({
          editor: currentEditor,
          type,
          hideWhenUnavailable,
        }),
        isActive: isMarkActive(currentEditor, type),
        canToggle: canToggleMark(currentEditor, type),
      }
    },
  })!
  const { isVisible, isActive, canToggle } = toolbarState

  const handleMark = useCallback(() => {
    if (!editor) return false

    const success = toggleMark(editor, type)
    if (success) {
      onToggled?.()
    }
    return success
  }, [editor, type, onToggled])

  return {
    isVisible,
    isActive,
    handleMark,
    canToggle,
    label: getFormattedMarkName(type),
    shortcutKeys: MARK_SHORTCUT_KEYS[type],
    Icon: markIcons[type],
  }
}
