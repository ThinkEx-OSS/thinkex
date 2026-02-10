"use client";

import React from "react";
import { Gift } from "lucide-react";
import { useNewFeature } from "@/lib/utils/new-feature";
import { cn } from "@/lib/utils";

interface NewFeatureBadgeProps {
  /** Unique key identifying this feature */
  featureKey: string;
  /** How long (in ms) the badge stays visible. Default: 14 days */
  ttl?: number;
  /** If provided, the badge won't show before this date */
  startDate?: Date;
  /** If provided, the badge won't show after this date */
  endDate?: Date;
  /** Dismiss when the wrapped element is clicked. Default: true */
  dismissOnClick?: boolean;
  /** The content to wrap */
  children: React.ReactNode;
  /** Additional className for the wrapper */
  className?: string;
  /** Style variant for the badge. Default: "dot" */
  variant?: "dot" | "badge" | "icon";
  /** Custom label text for the "badge" variant. Default: "New" */
  label?: string;
}

export function NewFeatureBadge({
  featureKey,
  ttl,
  startDate,
  endDate,
  dismissOnClick = true,
  children,
  className,
  variant = "dot",
  label = "New",
}: NewFeatureBadgeProps) {
  const { isNew, dismiss } = useNewFeature({ featureKey, ttl, startDate, endDate });

  const handleClick = () => {
    if (dismissOnClick && isNew) {
      dismiss();
    }
  };

  if (!isNew) {
    return <>{children}</>;
  }

  return (
    <span
      className={cn("relative inline-flex items-center", className)}
      onClick={handleClick}
    >
      {children}

      {variant === "dot" && (
        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
        </span>
      )}

      {variant === "badge" && (
        <span className="mx-1 inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">
          {label}
        </span>
      )}

      {variant === "icon" && (
        <Gift className="ml-1 size-3.5 text-purple-500 dark:text-purple-400 animate-pulse" />
      )}
    </span>
  );
}
