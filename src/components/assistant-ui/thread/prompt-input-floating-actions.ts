import { Brain, FileText, Play, Search } from "lucide-react";
import { LuBook } from "react-icons/lu";
import { PiCardsThreeBold } from "react-icons/pi";
import type { PromptBuilderAction } from "@/components/assistant-ui/PromptBuilderDialog";

export const PROMPT_INPUT_FLOATING_ACTIONS = [
  {
    id: "document",
    label: "Document",
    icon: FileText,
    iconClassName: "size-3.5 shrink-0 text-sky-400",
    action: "document" as PromptBuilderAction,
    useDialog: true,
  },
  {
    id: "learn",
    label: "Learn",
    icon: LuBook,
    iconClassName: "size-3.5 shrink-0 text-amber-500",
    subActions: [
      {
        id: "flashcards",
        label: "Flashcards",
        icon: PiCardsThreeBold,
        iconClassName: "size-4 text-purple-400 rotate-180",
        action: "flashcards" as PromptBuilderAction,
      },
      {
        id: "quiz",
        label: "Quiz",
        icon: Brain,
        iconClassName: "size-4 text-green-400",
        action: "quiz" as PromptBuilderAction,
      },
    ],
  },
  {
    id: "youtube",
    label: "YouTube",
    icon: Play,
    iconClassName: "size-3.5 text-red-500",
    action: "youtube" as PromptBuilderAction,
    useDialog: true,
  },
  {
    id: "search",
    label: "Search",
    icon: Search,
    iconClassName: "size-3.5 text-teal-500",
    action: "search" as PromptBuilderAction,
    useDialog: true,
  },
];
