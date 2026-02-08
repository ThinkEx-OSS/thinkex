"use client";

import type { ReactNode } from "react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { X, Eye, Image as ImageIcon } from "lucide-react";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { ToolUIErrorShell } from "@/components/assistant-ui/tool-ui-error-shell";
import { useOptimisticToolUpdate } from "@/hooks/ai/use-optimistic-tool-update";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import type { WorkspaceResult } from "@/lib/ai/tool-result-schemas";
import { parseWorkspaceResult } from "@/lib/ai/tool-result-schemas";

type AddImageArgs = {
    url: string;
    title: string;
    altText?: string;
    width?: number;
    height?: number;
};

interface AddImageReceiptProps {
    args: AddImageArgs;
    result: WorkspaceResult;
    status: any;
}

const AddImageReceipt = ({
    args,
    result,
    status,
}: AddImageReceiptProps) => {
    const navigateToItem = useNavigateToItem();

    const handleViewCard = () => {
        if (!result.itemId) return;
        navigateToItem(result.itemId);
    };

    return (
        <div
            className={cn(
                "my-1 flex w-full items-center justify-between overflow-hidden rounded-md border border-border/50 bg-card/50 text-card-foreground shadow-sm px-2 py-2",
                status?.type === "complete" && result.itemId && "cursor-pointer hover:bg-accent transition-colors"
            )}
            onClick={status?.type === "complete" && result.itemId ? handleViewCard : undefined}
        >
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className={cn(
                    status?.type === "complete" ? "text-blue-500" : "text-blue-400"
                )}>
                    {status?.type === "complete" ? (
                        <ImageIcon className="size-4" />
                    ) : (
                        <X className="size-4" />
                    )}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-medium truncate">
                        {status?.type === "complete" ? args.title : "Image Addition Cancelled"}
                    </span>
                    {status?.type === "complete" && (
                        <span className="text-[10px] text-muted-foreground">
                            Image card added
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-1">
                {status?.type === "complete" && result.itemId && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 text-[10px] px-2"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleViewCard();
                        }}
                    >
                        <Eye className="size-3" />
                        View
                    </Button>
                )}
            </div>
        </div>
    );
};

export const AddImageToolUI = makeAssistantToolUI<AddImageArgs, WorkspaceResult>({
    toolName: "addImage",
    render: function AddImageToolUI({ args, result, status }) {
        const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

        useOptimisticToolUpdate(status, result, workspaceId);

        let parsed: WorkspaceResult | null = null;
        if (status.type === "complete" && result != null) {
            try {
                parsed = parseWorkspaceResult(result);
            } catch (err) {
                console.error("🖼️ [AddImageTool] Failed to parse result:", err);
                parsed = null;
            }
        }

        let content: ReactNode = null;

        if (parsed?.success) {
            content = (
                <AddImageReceipt
                    args={args}
                    result={parsed}
                    status={status}
                />
            );
        } else if (status.type === "running") {
            content = <ToolUILoadingShell label="Adding image..." />;
        } else if (status.type === "complete" && parsed && !parsed.success) {
            content = (
                <ToolUIErrorShell
                    label="Failed to add image"
                    message={parsed.message}
                />
            );
        } else if (status.type === "incomplete" && status.reason === "error") {
            content = (
                <ToolUIErrorShell
                    label="Failed to add image"
                    message={parsed?.message}
                />
            );
        }

        return (
            <ToolUIErrorBoundary componentName="AddImage">
                {content}
            </ToolUIErrorBoundary>
        );
    },
});
