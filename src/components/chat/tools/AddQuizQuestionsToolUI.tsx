"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { useWorkspaceItems } from "@/hooks/workspace/use-workspace-items";
import type { ChatToolUIProps } from "@/lib/chat/tool-ui-types";
import { Eye, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "./tool-ui-loading-shell";
import { ToolUIErrorShell } from "./tool-ui-error-shell";
import type { QuizAddQuestionsResult } from "@/lib/ai/tool-result-schemas";
import { parseQuizAddQuestionsResult } from "@/lib/ai/tool-result-schemas";
import type { AddQuizQuestionsInput } from "@/lib/ai/tools/quiz-tools";
import type { Item } from "@/lib/workspace-state/types";

interface ReceiptProps {
  args: AddQuizQuestionsInput;
  result: QuizAddQuestionsResult;
}

const AddQuizQuestionsReceipt = ({ args, result }: ReceiptProps) => {
  const workspaceState = useWorkspaceItems();
  const navigateToItem = useNavigateToItem();

  const card = useMemo(() => {
    if (!result.itemId) return undefined;
    return workspaceState.find((item: Item) => item.id === result.itemId);
  }, [result.itemId, workspaceState]);

  const handleViewCard = () => {
    if (!result.itemId) return;
    navigateToItem(result.itemId);
  };

  return (
    <div
      className={cn(
        "my-1 flex w-full items-center justify-between overflow-hidden rounded-md border border-border/50 bg-card/50 text-card-foreground shadow-sm px-2 py-2",
        result.itemId && "cursor-pointer hover:bg-accent transition-colors",
      )}
      onClick={result.itemId ? handleViewCard : undefined}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="text-green-400">
          <Brain className="size-4" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs font-medium truncate">
            {card?.name ?? args.itemName ?? "Quiz"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {`Added ${result.questionsAdded ?? "?"} question${(result.questionsAdded ?? 0) !== 1 ? "s" : ""}${result.totalQuestions != null ? ` (${result.totalQuestions} total)` : ""}`}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {result.itemId && (
          <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); handleViewCard(); }}>
            <Eye className="size-3" />
            Take Quiz
          </Button>
        )}
      </div>
    </div>
  );
};

export const renderAddQuizQuestionsToolUI: ChatToolUIProps<AddQuizQuestionsInput, QuizAddQuestionsResult>["render"] = ({ args, result, status }) => {
  let parsed: QuizAddQuestionsResult | null = null;
  if (status.type === "complete" && result != null) {
    try { parsed = parseQuizAddQuestionsResult(result); } catch { parsed = null; }
  }

  let content: ReactNode = null;
  if (status.type === "running") {
    content = <ToolUILoadingShell label={args?.itemName ? `Adding questions to "${args.itemName}"…` : "Adding questions…"} />;
  } else if (status.type === "complete" && parsed?.success) {
    content = <AddQuizQuestionsReceipt args={args} result={parsed} />;
  } else if (status.type === "complete" && parsed && !parsed.success) {
    content = <ToolUIErrorShell label="Failed to add questions" message={parsed.message} />;
  } else if (status.type === "incomplete" && status.reason === "error") {
    content = <ToolUIErrorShell label="Failed to add questions" message="An error occurred" />;
  }

  return <ToolUIErrorBoundary componentName="AddQuizQuestions">{content}</ToolUIErrorBoundary>;
};
