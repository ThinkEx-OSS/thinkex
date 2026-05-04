"use client";

import type { ReactNode } from "react";
import type { ChatToolUIProps } from "@/lib/chat/tool-ui-types";
import { FolderInput } from "lucide-react";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "./tool-ui-loading-shell";
import { ToolUIErrorShell } from "./tool-ui-error-shell";
import type { WorkspaceResult } from "@/lib/ai/tool-result-schemas";
import { parseWorkspaceResult } from "@/lib/ai/tool-result-schemas";

type MoveItemArgs = { itemNames: string[]; folderName: string | null };

interface MoveItemResult extends WorkspaceResult {
  movedCount?: number;
  movedItems?: string[];
  targetFolder?: string;
  failedItems?: string[];
}

interface MoveItemReceiptProps {
  args: MoveItemArgs;
  result: MoveItemResult;
}

const MoveItemReceipt = ({ args, result }: MoveItemReceiptProps) => {
  const count = result.movedCount ?? result.movedItems?.length ?? 0;
  const names = result.movedItems ?? args.itemNames;
  const target = result.targetFolder ?? args.folderName ?? "root";

  return (
    <div className="my-1 flex w-full items-center justify-between overflow-hidden rounded-md border border-border/25 bg-card/50 text-card-foreground shadow-sm px-2 py-2">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="text-blue-400">
          <FolderInput className="size-4" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs font-medium truncate">
            {count === 1
              ? `Moved "${names[0]}"`
              : `Moved ${count} items`}
          </span>
          <span className="text-[10px] text-muted-foreground truncate">
            {target === "root" ? "To workspace root" : `To "${target}"`}
          </span>
        </div>
      </div>
    </div>
  );
};

export const renderMoveItemToolUI: ChatToolUIProps<
  MoveItemArgs,
  WorkspaceResult
>["render"] = ({ args, result, status }) => {
  let parsed: MoveItemResult | null = null;
  if (result != null) {
    try {
      parsed = parseWorkspaceResult(result) as MoveItemResult;
    } catch {
      parsed = null;
    }
  }

  let content: ReactNode = null;

  if (parsed?.success) {
    content = <MoveItemReceipt args={args} result={parsed} />;
  } else if (status.type === "running") {
    const count = args?.itemNames?.length ?? 0;
    content = (
      <ToolUILoadingShell
        label={
          count === 1
            ? `Moving "${args.itemNames[0]}"…`
            : `Moving ${count} items…`
        }
      />
    );
  } else if (status.type === "complete" && parsed && !parsed.success) {
    content = (
      <ToolUIErrorShell label="Failed to move" message={parsed.message} />
    );
  } else if (status.type === "incomplete" && status.reason === "error") {
    content = (
      <ToolUIErrorShell
        label="Failed to move"
        message={parsed?.message ?? "An error occurred"}
      />
    );
  }

  return (
    <ToolUIErrorBoundary componentName="MoveItem">
      {content}
    </ToolUIErrorBoundary>
  );
};
