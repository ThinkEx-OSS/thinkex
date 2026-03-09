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
        "relative z-30 flex w-px items-center justify-center outline-none data-[orientation=vertical]:h-px data-[orientation=vertical]:w-full [&[data-orientation=vertical]>div]:rotate-90",
        "border-transparent dark:border-sidebar-border",
        "[&[data-separator=hover]]:border-muted-foreground [&[data-separator=active]]:border-muted-foreground",
        "[&[data-separator=hover]:not([data-orientation=vertical])]:shadow-[0.5px_0_0_0_var(--muted-foreground),-0.5px_0_0_0_var(--muted-foreground)]",
        "[&[data-separator=hover][data-orientation=vertical]]:shadow-[0_0.5px_0_0_var(--muted-foreground),0_-0.5px_0_0_var(--muted-foreground)]",
        "[&[data-separator=active]:not([data-orientation=vertical])]:shadow-[0.5px_0_0_0_var(--muted-foreground),-0.5px_0_0_0_var(--muted-foreground)]",
        "[&[data-separator=active][data-orientation=vertical]]:shadow-[0_0.5px_0_0_var(--muted-foreground),0_-0.5px_0_0_var(--muted-foreground)]",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
