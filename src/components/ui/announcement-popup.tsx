"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Rocket, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNewFeature } from "@/lib/utils/new-feature";
import { cn } from "@/lib/utils";

export interface AnnouncementItem {
  /** Item title */
  title: string;
  /** Subtitle / description text */
  description?: React.ReactNode;
  /** Optional icon for header. Default: Sparkles */
  icon?: React.ReactNode;
  /** Optional image URL for the main visual */
  image?: string;
  /** Optional custom illustration (React node) - use instead of image when you need icons/shapes */
  illustration?: React.ReactNode;
}

export interface AnnouncementPopupProps {
  /** Unique key identifying this announcement set */
  featureKey: string;
  /** Items to cycle through (title + icon each) */
  items: AnnouncementItem[];
  /** Primary button text (e.g. "Got it"). Default: "Got it" */
  ctaLabel?: string;
  /** Optional link for CTA - if set, CTA becomes a link instead of button */
  ctaHref?: string;
  /** How long (in ms) the popup stays visible. Default: 14 days */
  ttl?: number;
  /** If provided, won't show before this date */
  startDate?: Date;
  /** If provided, won't show after this date */
  endDate?: Date;
}

const FADE_MS = 200;

function useCarousel(itemCount: number, open: boolean) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [fading, setFading] = React.useState(false);
  const fadeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  React.useEffect(() => {
    if (!open) {
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }
      setActiveIndex(0);
      setFading(false);
    }
  }, [open]);

  const transitionTo = React.useCallback((nextIndex: number) => {
    if (itemCount <= 1) return;
    setFading(true);
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    fadeTimeoutRef.current = setTimeout(() => {
      setActiveIndex(nextIndex);
      setFading(false);
      fadeTimeoutRef.current = null;
    }, FADE_MS);
  }, [itemCount]);

  const goPrev = React.useCallback(() => {
    transitionTo((activeIndex - 1 + itemCount) % itemCount);
  }, [activeIndex, itemCount, transitionTo]);

  const goNext = React.useCallback(() => {
    transitionTo((activeIndex + 1) % itemCount);
  }, [activeIndex, itemCount, transitionTo]);

  const goTo = React.useCallback(
    (index: number) => transitionTo(index),
    [transitionTo],
  );

  return { activeIndex, fading, goPrev, goNext, goTo };
}

export function AnnouncementPopup({
  featureKey,
  items,
  ctaLabel = "Got it",
  ctaHref,
  ttl,
  startDate,
  endDate,
}: AnnouncementPopupProps) {
  const { isNew, dismiss } = useNewFeature({
    featureKey,
    ttl,
    startDate,
    endDate,
  });

  const carousel = useCarousel(items.length, isNew);
  const { activeIndex, fading, goPrev, goNext, goTo } = carousel;

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) dismiss();
    },
    [dismiss],
  );

  const handleCtaClick = React.useCallback(() => {
    dismiss();
  }, [dismiss]);

  if (!isNew || items.length === 0) return null;

  const item = items[activeIndex];
  const Icon = item.icon ?? <Sparkles className="size-6 text-primary" />;
  const showNav = items.length > 1;
  const isLastItem = activeIndex === items.length - 1;
  const footerButtonLabel = isLastItem ? ctaLabel : "Next";

  return (
    <Dialog open={isNew} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        overlayClassName="bg-black/70"
      >
        <DialogHeader>
          <div
            className={cn(
              "transition-opacity",
              fading ? "opacity-0" : "opacity-100",
            )}
            style={{ transitionDuration: `${FADE_MS}ms` }}
          >
            <Badge
              variant="secondary"
              className="mb-2 w-fit bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
            >
              <Rocket className="size-3" />
              NEW
            </Badge>
            <DialogTitle>{item.title}</DialogTitle>
            {item.description &&
              (typeof item.description === "string" ? (
                <DialogDescription className="mt-2">
                  {item.description}
                </DialogDescription>
              ) : (
                <DialogDescription
                  className="mt-2 text-muted-foreground text-sm"
                  asChild
                >
                  <div>{item.description}</div>
                </DialogDescription>
              ))}
            <div className="mt-4 w-full">
              {item.image ? (
                <Image
                  src={item.image}
                  alt=""
                  width={400}
                  height={200}
                  className="w-full h-auto rounded-lg object-contain"
                  unoptimized
                />
              ) : (
                <div className="flex min-h-24 min-w-24 items-center justify-center rounded-xl bg-primary/10 px-6 py-4">
                  {item.illustration ?? (
                    <div className="scale-150 text-primary">{Icon}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        <DialogFooter
          className={cn(
            "flex-row flex-wrap items-center gap-2",
            showNav ? "justify-between" : "justify-end",
          )}
        >
          {showNav ? (
            <>
              <div
                className="invisible shrink-0"
                aria-hidden="true"
              >
                <Button disabled>{footerButtonLabel}</Button>
              </div>
              <div className="flex flex-1 items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  aria-label="Previous"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <div className="flex items-center gap-1.5">
                  {items.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => goTo(index)}
                      className={cn(
                        "h-2 rounded-full transition-all duration-200",
                        index === activeIndex
                          ? "w-6 bg-primary"
                          : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50",
                      )}
                      aria-label={`Go to item ${index + 1}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  aria-label="Next"
                >
                  <ChevronRight className="size-5" />
                </button>
              </div>
              {isLastItem && ctaHref ? (
                <Button asChild onClick={handleCtaClick} className="shrink-0">
                  <Link href={ctaHref}>{footerButtonLabel}</Link>
                </Button>
              ) : (
                <Button
                  onClick={isLastItem ? handleCtaClick : goNext}
                  className="shrink-0"
                >
                  {footerButtonLabel}
                </Button>
              )}
            </>
          ) : (
            <>
              {ctaHref ? (
                <Button asChild onClick={handleCtaClick}>
                  <Link href={ctaHref}>{ctaLabel}</Link>
                </Button>
              ) : (
                <Button onClick={handleCtaClick}>{ctaLabel}</Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
