"use client";

import type { ReactNode } from "react";
import type { ChatToolUIProps } from "@/lib/chat/tool-ui-types";
import { Trash2 } from "lucide-react";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "./tool-ui-loading-shell";
import { ToolUIErrorShell } from "./tool-ui-error-shell";
import type { WorkspaceResult } from "@/lib/ai/tool-result-schemas";
import { parseWorkspaceResult } from "@/lib/ai/tool-result-schemas";

type DeleteItemArgs = { itemNames: string[] };

interface DeleteItemResult extends WorkspaceResult {
  deletedCount?: number;
  deletedItems?: string[];
  failedItems?: string[];
}

interface DeleteItemReceiptProps {
  args: DeleteItemArgs;
  result: DeleteItemResult;
  status: { type: string };
}

const DeleteItemReceipt = ({ args, result, status }: DeleteItemReceiptProps) => {
  const count = result.deletedCount ?? result.deletedItems?.length ?? 0;
  const names = result.deletedItems ?? args.itemNames;

  return (
    <div className="my-1 flex w-full items-center justify-between overflow-hidden rounded-md border border-border/25 bg-card/50 text-card-foreground shadow-sm px-2 py-2">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="text-red-400">
          <Trash2 className="size-4" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs font-medium truncate">
            {count === 1
              ? `Deleted "${names[0]}"`
              : `Deleted ${count} items`}
          </span>
          {count > 1 && (
            <span className="text-[10px] text-muted-foreground truncate">
              {names.slice(0, 3).join(", ")}
              {names.length > 3 ? ` +${names.length - 3} more` : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const renderDeleteItemToolUI: ChatToolUIProps<
  DeleteItemArgs,
  WorkspaceResult
>["render"] = ({ args, result, status }) => {
  let parsed: DeleteItemResult | null = null;
  if (result != null) {
    try {
      parsed = parseWorkspaceResult(result) as DeleteItemResult;
    } catch {
      parsed = null;
    }
  }

  let content: ReactNode = null;

  if (parsed?.success) {
    content = <DeleteItemReceipt args={args} result={parsed} status={status} />;
  } else if (status.type === "running") {
    const count = args?.itemNames?.length ?? 0;
    content = (
      <ToolUILoadingShell
        label={
          count === 1
            ? `Deleting "${args.itemNames[0]}"…`
            : `Deleting ${count} items…`
        }
      />
    );
  } else if (status.type === "complete" && parsed && !parsed.success) {
    content = (
      <ToolUIErrorShell label="Failed to delete" message={parsed.message} />
    );
  } else if (status.type === "incomplete" && status.reason === "error") {
    content = (
      <ToolUIErrorShell
        label="Failed to delete"
        message={parsed?.message ?? "An error occurred"}
      />
    );
  }

  return (
    <ToolUIErrorBoundary componentName="DeleteItem">
      {content}
    </ToolUIErrorBoundary>
  );
};
