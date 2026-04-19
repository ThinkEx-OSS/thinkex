"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { FC } from "react";
import {
  ChatBranchPicker,
  type ChatBranchPickerRootProps,
} from "@/lib/chat/runtime";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";

export const BranchPicker: FC<ChatBranchPickerRootProps> = ({
  className,
  hideWhenSingleBranch: _hideWhenSingleBranch,
  ...rest
}) => {
  return (
    <ChatBranchPicker.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root mr-2 -ml-2 inline-flex items-center text-xs text-muted-foreground",
        className,
      )}
      {...rest}
    >
      <ChatBranchPicker.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </ChatBranchPicker.Previous>
      <span className="aui-branch-picker-state font-medium">
        <ChatBranchPicker.Number /> / <ChatBranchPicker.Count />
      </span>
      <ChatBranchPicker.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </ChatBranchPicker.Next>
    </ChatBranchPicker.Root>
  );
};
