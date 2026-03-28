"use client"

import * as React from "react"
import { GripVerticalIcon } from "lucide-react"
import { Group, Panel, Separator } from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof Group>) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn(
        "h-full w-full",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({
  ...props
}: React.ComponentProps<typeof Panel>) {
  return <Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean
}) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "relative z-30 flex shrink-0 items-center justify-center overflow-visible outline-none touch-none select-none",
        "[&[aria-orientation=vertical]]:-mx-1.5 [&[aria-orientation=vertical]]:w-3",
        "[&[aria-orientation=horizontal]]:-my-1.5 [&[aria-orientation=horizontal]]:h-3",
        "[&[aria-orientation=vertical]]:cursor-col-resize [&[aria-orientation=horizontal]]:cursor-row-resize",
        "before:pointer-events-none before:absolute before:bg-sidebar-border before:transition-all before:duration-150",
        "[&[aria-orientation=vertical]]:before:inset-y-0 [&[aria-orientation=vertical]]:before:left-1/2 [&[aria-orientation=vertical]]:before:w-px [&[aria-orientation=vertical]]:before:-translate-x-1/2",
        "[&[aria-orientation=horizontal]]:before:inset-x-0 [&[aria-orientation=horizontal]]:before:top-1/2 [&[aria-orientation=horizontal]]:before:h-px [&[aria-orientation=horizontal]]:before:-translate-y-1/2",
        "[&[data-separator=hover]]:before:bg-muted-foreground [&[data-separator=active]]:before:bg-muted-foreground",
        "[&[data-separator=hover][aria-orientation=vertical]]:before:w-[2px]",
        "[&[data-separator=active][aria-orientation=vertical]]:before:w-[3px]",
        "[&[data-separator=hover][aria-orientation=horizontal]]:before:h-[2px]",
        "[&[data-separator=active][aria-orientation=horizontal]]:before:h-[3px]",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-background text-muted-foreground z-10 flex h-4 w-3 pointer-events-none items-center justify-center rounded-xs border border-sidebar-border shadow-sm">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
