"use client";

import type { CarouselApi } from "@/components/ui/carousel";
import type { ComponentProps, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type InlineCitationProps = ComponentProps<"span">;

export const InlineCitation = ({
  className,
  ...props
}: InlineCitationProps) => (
  <span
    className={cn("group inline-flex items-baseline gap-1", className)}
    {...props}
  />
);

export type InlineCitationTextProps = ComponentProps<"span">;

export const InlineCitationText = ({
  className,
  ...props
}: InlineCitationTextProps) => (
  <span
    className={cn("transition-colors group-hover:bg-accent", className)}
    {...props}
  />
);

export type InlineCitationCardProps = ComponentProps<typeof HoverCard>;

export const InlineCitationCard = (props: InlineCitationCardProps) => (
  <HoverCard openDelay={200} closeDelay={100} {...props} />
);

export type InlineCitationCardTriggerProps = ComponentProps<typeof Badge> & {
  sources: string[];
  /** Shown when sources is empty (e.g. during streaming) */
  fallbackLabel?: string;
};

function getBadgeLabel(sources: string[], fallbackLabel: string): ReactNode {
  if (!sources[0]) return fallbackLabel;
  try {
    const url = new URL(sources[0]);
    return (
      <>
        {url.hostname}{" "}
        {sources.length > 1 && `+${sources.length - 1}`}
      </>
    );
  } catch {
    return fallbackLabel;
  }
}

export const InlineCitationCardTrigger = ({
  sources,
  fallbackLabel = "unknown",
  className,
  ...props
}: InlineCitationCardTriggerProps) => (
  <HoverCardTrigger asChild>
    <Badge
      className={cn("ml-1 rounded-full", className)}
      variant="secondary"
      {...props}
    >
      {getBadgeLabel(sources, fallbackLabel)}
    </Badge>
  </HoverCardTrigger>
);

export type InlineCitationCardBodyProps = ComponentProps<"div">;

export const InlineCitationCardBody = ({
  className,
  ...props
}: InlineCitationCardBodyProps) => (
  <HoverCardContent className={cn("relative w-80 p-0", className)} {...props} />
);

const CarouselApiContext = createContext<CarouselApi | undefined>(undefined);

const useCarouselApi = () => {
  const context = useContext(CarouselApiContext);
  return context;
};

export type InlineCitationCarouselProps = ComponentProps<typeof Carousel>;

export const InlineCitationCarousel = ({
  className,
  children,
  ...props
}: InlineCitationCarouselProps) => {
  const [api, setApi] = useState<CarouselApi>();

  return (
    <CarouselApiContext.Provider value={api}>
      <Carousel className={cn("w-full", className)} setApi={setApi} {...props}>
        {children}
      </Carousel>
    </CarouselApiContext.Provider>
  );
};

export type InlineCitationCarouselContentProps = ComponentProps<"div">;

export const InlineCitationCarouselContent = (
  props: InlineCitationCarouselContentProps
) => <CarouselContent {...props} />;

export type InlineCitationCarouselItemProps = ComponentProps<"div">;

export const InlineCitationCarouselItem = ({
  className,
  ...props
}: InlineCitationCarouselItemProps) => (
  <CarouselItem
    className={cn("w-full space-y-2 p-4 pl-8", className)}
    {...props}
  />
);

export type InlineCitationCarouselHeaderProps = ComponentProps<"div">;

export const InlineCitationCarouselHeader = ({
  className,
  ...props
}: InlineCitationCarouselHeaderProps) => (
  <div
    className={cn(
      "flex items-center justify-between gap-2 rounded-t-md bg-secondary p-2",
      className
    )}
    {...props}
  />
);

export type InlineCitationCarouselIndexProps = ComponentProps<"div">;

export const InlineCitationCarouselIndex = ({
  children,
  className,
  ...props
}: InlineCitationCarouselIndexProps) => {
  const api = useCarouselApi();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) {
      return;
    }

    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap() + 1);

    const handleSelect = () => {
      setCurrent(api.selectedScrollSnap() + 1);
    };

    api.on("select", handleSelect);

    return () => {
      api.off("select", handleSelect);
    };
  }, [api]);

  return (
    <div
      className={cn(
        "flex flex-1 items-center justify-end px-3 py-1 text-muted-foreground text-xs",
        className
      )}
      {...props}
    >
      {children ?? `${current}/${count}`}
    </div>
  );
};

export type InlineCitationCarouselPrevProps = ComponentProps<"button">;

export const InlineCitationCarouselPrev = ({
  className,
  ...props
}: InlineCitationCarouselPrevProps) => {
  const api = useCarouselApi();

  const handleClick = useCallback(() => {
    if (api) {
      api.scrollPrev();
    }
  }, [api]);

  return (
    <button
      aria-label="Previous"
      className={cn("shrink-0", className)}
      onClick={handleClick}
      type="button"
      {...props}
    >
      <ArrowLeftIcon className="size-4 text-muted-foreground" />
    </button>
  );
};

export type InlineCitationCarouselNextProps = ComponentProps<"button">;

export const InlineCitationCarouselNext = ({
  className,
  ...props
}: InlineCitationCarouselNextProps) => {
  const api = useCarouselApi();

  const handleClick = useCallback(() => {
    if (api) {
      api.scrollNext();
    }
  }, [api]);

  return (
    <button
      aria-label="Next"
      className={cn("shrink-0", className)}
      onClick={handleClick}
      type="button"
      {...props}
    >
      <ArrowRightIcon className="size-4 text-muted-foreground" />
    </button>
  );
};

export type InlineCitationSourceProps = ComponentProps<"div"> & {
  title?: string;
  url?: string;
  /** When set (and no url), makes content clickable (e.g. open workspace note) */
  onClick?: () => void;
};

export const InlineCitationSource = ({
  title,
  url,
  onClick,
  className,
  children,
  ...props
}: InlineCitationSourceProps) => {
  const content = (
    <>
      {title && (
        <h4 className="truncate font-medium text-sm leading-tight">{title}</h4>
      )}
      {url && (
        <p className="truncate break-all text-muted-foreground text-xs">{url}</p>
      )}
      {children}
    </>
  );

  const clickable = url || onClick;
  const baseClasses = cn(
    "space-y-1 block w-full text-left",
    clickable && "cursor-pointer transition-colors hover:bg-muted/50 rounded-md -m-1 p-1"
  );

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={cn(baseClasses, className)}
        {...(props as ComponentProps<"a">)}
      >
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(baseClasses, className)}
        {...props}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={cn(baseClasses, className)} {...props}>
      {content}
    </div>
  );
};

export type InlineCitationQuoteProps = ComponentProps<"blockquote">;

export const InlineCitationQuote = ({
  children,
  className,
  ...props
}: InlineCitationQuoteProps) => (
  <blockquote
    className={cn(
      "border-muted border-l-2 pl-3 text-muted-foreground text-sm italic",
      className
    )}
    {...props}
  >
    {children}
  </blockquote>
);
