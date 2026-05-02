"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCw, ShieldAlert } from "lucide-react";
import Link from "next/link";

export interface AccessDeniedProps {
  /**
   * Override the headline. Defaults to "Access Denied" (true 403/404 case).
   * For the Zero-error / timeout case, pass "Couldn't load workspace".
   */
  title?: string;
  description?: string;
  /**
   * If provided, renders a primary "Try again" button that calls this. Used by
   * the Zero error/timeout state — keeps page state instead of reloading.
   */
  onRetry?: () => void | Promise<void>;
}

export function AccessDenied({
  title = "Access Denied",
  description = "You don't have permission to view this workspace, or it doesn't exist.",
  onRetry,
}: AccessDeniedProps) {
  return (
    <div className="flex flex-1 w-full flex-col items-center justify-center gap-6 p-8 text-center animate-in fade-in duration-500">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
        <ShieldAlert className="h-10 w-10 text-destructive" />
      </div>

      <div className="max-w-md space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <div className="flex gap-4">
        {onRetry && (
          <Button onClick={onRetry} size="lg" className="gap-2">
            <RotateCw className="h-4 w-4" />
            Try again
          </Button>
        )}
        <Button asChild variant="outline" size="lg" className="gap-2">
          <Link href="/home">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </Button>
      </div>
    </div>
  );
}
