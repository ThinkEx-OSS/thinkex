import { Brain, FileText, Play, Search, Upload } from "lucide-react";
import { PiCardsThreeBold } from "react-icons/pi";
import type { PromptBuilderAction } from "@/components/assistant-ui/PromptBuilderDialog";

export const SUGGESTION_ACTIONS = [
  {
    title: "Search",
    icon: Search,
    iconClassName: "size-4 shrink-0 text-sky-500",
    action: "search" as PromptBuilderAction,
    useDialog: true,
  },
  {
    title: "Flashcards",
    icon: PiCardsThreeBold,
    iconClassName: "size-4 shrink-0 text-purple-400 rotate-180",
    action: "flashcards" as PromptBuilderAction,
    useDialog: true,
  },
  {
    title: "YouTube",
    icon: Play,
    iconClassName: "size-4 shrink-0 text-red-500",
    action: "youtube" as PromptBuilderAction,
    useDialog: true,
  },
  {
    title: "Upload",
    icon: Upload,
    iconClassName: "size-4 shrink-0 text-red-400",
    triggerFileInput: true,
  },
  {
    title: "Quiz",
    icon: Brain,
    iconClassName: "size-4 shrink-0 text-green-400",
    action: "quiz" as PromptBuilderAction,
    useDialog: true,
  },
  {
    title: "Document",
    icon: FileText,
    iconClassName: "size-4 shrink-0 text-sky-400",
    action: "document" as PromptBuilderAction,
    useDialog: true,
  },
];
