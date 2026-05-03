"use client";

import { Brain } from "lucide-react";
import type { Item, QuizData } from "@/lib/workspace-state/types";

interface QuizCardContentProps {
  item: Item;
}

export function QuizCardContent({ item }: QuizCardContentProps) {
  const quizData = item.data as QuizData;
  const questionCount = quizData.questions?.length ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-md px-4 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-foreground/8 text-muted-foreground">
        <Brain className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted-foreground">
        {questionCount} question{questionCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export default QuizCardContent;
