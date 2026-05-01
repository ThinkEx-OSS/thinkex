"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type ReactNode,
  type CSSProperties,
  type Key,
} from "react";
import "./LogoLoop.css";

const ANIMATION_CONFIG = { SMOOTH_TAU: 0.25, MIN_COPIES: 2, COPY_HEADROOM: 2 };

type LogoNodeItem = {
  node: ReactNode;
  title?: string;
  href?: string;
  ariaLabel?: string;
};
type LogoImageItem = {
  src: string;
  srcSet?: string;
  sizes?: string;
  width?: number;
  height?: number;
  alt?: string;
  title?: string;
  href?: string;
};
type LogoItem = LogoNodeItem | LogoImageItem;

interface LogoLoopProps {
  logos: LogoItem[];
  speed?: number;
  direction?: "left" | "right" | "up" | "down";
  width?: number | string;
  logoHeight?: number;
  gap?: number;
  pauseOnHover?: boolean;
  hoverSpeed?: number;
  fadeOut?: boolean;
  fadeOutColor?: string;
  scaleOnHover?: boolean;
  renderItem?: (item: LogoItem, key: Key) => ReactNode;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

const toCssLength = (value: number | string | undefined) =>
  typeof value === "number" ? `${value}px` : (value ?? undefined);

function useResizeObserver(
  callback: () => void,
  elements: React.RefObject<HTMLElement | null>[],
  dependencies: unknown[],
) {
  useEffect(() => {
    if (!window.ResizeObserver) {
      const handleResize = () => callback();
      window.addEventListener("resize", handleResize);
      callback();
      return () => window.removeEventListener("resize", handleResize);
    }
    const observers = elements.map((ref) => {
      if (!ref.current) return null;
      const observer = new ResizeObserver(callback);
      observer.observe(ref.current);
      return observer;
    });
    callback();
    return () => observers.forEach((o) => o?.disconnect());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback, ...dependencies]);
}

function useImageLoader(
  seqRef: React.RefObject<HTMLElement | null>,
  onLoad: () => void,
  dependencies: unknown[],
) {
  useEffect(() => {
    const images = seqRef.current?.querySelectorAll("img") ?? [];
    if (images.length === 0) {
      onLoad();
      return;
    }
    let remaining = images.length;
    const done = () => {
      remaining -= 1;
      if (remaining === 0) onLoad();
    };
    images.forEach((img) => {
      if ((img as HTMLImageElement).complete) done();
      else {
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      }
    });
    return () =>
      images.forEach((img) => {
        img.removeEventListener("load", done);
        img.removeEventListener("error", done);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLoad, ...dependencies]);
}

function useAnimationLoop(
  trackRef: React.RefObject<HTMLElement | null>,
  targetVelocity: number,
  seqWidth: number,
  seqHeight: number,
  isHovered: boolean,
  hoverSpeed: number | undefined,
  isVertical: boolean,
) {
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const offsetRef = useRef(0);
  const velRef = useRef(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const seqSize = isVertical ? seqHeight : seqWidth;

    const animate = (ts: number) => {
      if (lastRef.current === null) lastRef.current = ts;
      const dt = Math.max(0, ts - lastRef.current) / 1000;
      lastRef.current = ts;
      const target =
        isHovered && hoverSpeed !== undefined ? hoverSpeed : targetVelocity;
      const ease = 1 - Math.exp(-dt / ANIMATION_CONFIG.SMOOTH_TAU);
      velRef.current += (target - velRef.current) * ease;
      if (seqSize > 0) {
        let next = offsetRef.current + velRef.current * dt;
        next = ((next % seqSize) + seqSize) % seqSize;
        offsetRef.current = next;
        track.style.transform = isVertical
          ? `translate3d(0,${-next}px,0)`
          : `translate3d(${-next}px,0,0)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = null;
    };
  }, [
    targetVelocity,
    seqWidth,
    seqHeight,
    isHovered,
    hoverSpeed,
    isVertical,
    trackRef,
  ]);
}

export const LogoLoop = memo(function LogoLoop({
  logos,
  speed = 120,
  direction = "left",
  width = "100%",
  logoHeight = 28,
  gap = 32,
  pauseOnHover,
  hoverSpeed,
  fadeOut = false,
  fadeOutColor,
  scaleOnHover = false,
  renderItem,
  ariaLabel = "Partner logos",
  className,
  style,
}: LogoLoopProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef<HTMLUListElement>(null);
  const [seqWidth, setSeqWidth] = useState(0);
  const [seqHeight, setSeqHeight] = useState(0);
  const [copyCount, setCopyCount] = useState(ANIMATION_CONFIG.MIN_COPIES);
  const [isHovered, setIsHovered] = useState(false);

  const effectiveHoverSpeed = useMemo(() => {
    if (hoverSpeed !== undefined) return hoverSpeed;
    if (pauseOnHover === true) return 0;
    if (pauseOnHover === false) return undefined;
    return 0;
  }, [hoverSpeed, pauseOnHover]);

  const isVertical = direction === "up" || direction === "down";

  const targetVelocity = useMemo(() => {
    const mag = Math.abs(speed);
    const dir = isVertical
      ? direction === "up"
        ? 1
        : -1
      : direction === "left"
        ? 1
        : -1;
    return mag * dir * (speed < 0 ? -1 : 1);
  }, [speed, direction, isVertical]);

  const updateDimensions = useCallback(() => {
    const cw = containerRef.current?.clientWidth ?? 0;
    const rect = seqRef.current?.getBoundingClientRect();
    const sw = rect?.width ?? 0;
    const sh = rect?.height ?? 0;
    if (isVertical) {
      if (sh > 0) {
        setSeqHeight(Math.ceil(sh));
        const vp =
          containerRef.current?.clientHeight ??
          containerRef.current?.parentElement?.clientHeight ??
          sh;
        setCopyCount(
          Math.max(
            ANIMATION_CONFIG.MIN_COPIES,
            Math.ceil(vp / sh) + ANIMATION_CONFIG.COPY_HEADROOM,
          ),
        );
      }
    } else if (sw > 0) {
      setSeqWidth(Math.ceil(sw));
      setCopyCount(
        Math.max(
          ANIMATION_CONFIG.MIN_COPIES,
          Math.ceil(cw / sw) + ANIMATION_CONFIG.COPY_HEADROOM,
        ),
      );
    }
  }, [isVertical]);

  useResizeObserver(updateDimensions, [containerRef, seqRef], [
    logos,
    gap,
    logoHeight,
    isVertical,
  ]);
  useImageLoader(seqRef, updateDimensions, [logos, gap, logoHeight, isVertical]);
  useAnimationLoop(
    trackRef,
    targetVelocity,
    seqWidth,
    seqHeight,
    isHovered,
    effectiveHoverSpeed,
    isVertical,
  );

  const cssVars = useMemo(
    () =>
      ({
        "--logoloop-gap": `${gap}px`,
        "--logoloop-logoHeight": `${logoHeight}px`,
        ...(fadeOutColor && { "--logoloop-fadeColor": fadeOutColor }),
      }) as CSSProperties,
    [gap, logoHeight, fadeOutColor],
  );

  const rootClass = [
    "logoloop",
    isVertical ? "logoloop--vertical" : "logoloop--horizontal",
    fadeOut && "logoloop--fade",
    scaleOnHover && "logoloop--scale-hover",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const enter = useCallback(
    () => effectiveHoverSpeed !== undefined && setIsHovered(true),
    [effectiveHoverSpeed],
  );
  const leave = useCallback(
    () => effectiveHoverSpeed !== undefined && setIsHovered(false),
    [effectiveHoverSpeed],
  );

  const renderLogo = useCallback(
    (item: LogoItem, key: Key) => {
      if (renderItem)
        return (
          <li className="logoloop__item" key={key} role="listitem">
            {renderItem(item, key)}
          </li>
        );
      const isNode = "node" in item;
      const content = isNode ? (
        <span className="logoloop__node">{(item as LogoNodeItem).node}</span>
      ) : (
        <img
          src={(item as LogoImageItem).src}
          alt={(item as LogoImageItem).alt ?? ""}
          title={(item as LogoImageItem).title}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      );
      return (
        <li className="logoloop__item" key={key} role="listitem">
          {content}
        </li>
      );
    },
    [renderItem],
  );

  const lists = useMemo(
    () =>
      Array.from({ length: copyCount }, (_, ci) => (
        <ul
          className="logoloop__list"
          key={`c-${ci}`}
          role="list"
          aria-hidden={ci > 0}
          ref={ci === 0 ? seqRef : undefined}
        >
          {logos.map((item, ii) => renderLogo(item, `${ci}-${ii}`))}
        </ul>
      )),
    [copyCount, logos, renderLogo],
  );

  return (
    <div
      ref={containerRef}
      className={rootClass}
      style={{
        width: isVertical
          ? toCssLength(width) === "100%"
            ? undefined
            : toCssLength(width)
          : (toCssLength(width) ?? "100%"),
        ...cssVars,
        ...style,
      }}
      role="region"
      aria-label={ariaLabel}
    >
      <div
        className="logoloop__track"
        ref={trackRef}
        onMouseEnter={enter}
        onMouseLeave={leave}
      >
        {lists}
      </div>
    </div>
  );
});

export default LogoLoop;
