"use client"

import type { ChainedCommands, CanCommands } from "@tiptap/react"

export function hasToggleNodeBackgroundColor(
  commands: CanCommands
): commands is CanCommands & {
  toggleNodeBackgroundColor: (color: string) => boolean
} {
  return "toggleNodeBackgroundColor" in commands
}

export function hasNodeBackgroundChainCommands(
  commands: ChainedCommands
): commands is ChainedCommands & {
  toggleNodeBackgroundColor: (color: string) => ChainedCommands
  unsetNodeBackgroundColor: () => ChainedCommands
} {
  return (
    "toggleNodeBackgroundColor" in commands &&
    "unsetNodeBackgroundColor" in commands
  )
}
