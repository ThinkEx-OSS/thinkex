"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";

const DEMO_VIDEO_SRC = "/demo.mp4";
const hasDemoVideo = DEMO_VIDEO_SRC.length > 0;

const overlayButtonClass =
  "flex flex-col items-center gap-2 rounded-full bg-white/15 px-8 py-6 text-white backdrop-blur-sm transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

export function DemoVideoSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubTrackRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasEnded, setHasEnded] = useState(false);
  const [hasPlayStarted, setHasPlayStarted] = useState(false);

  const restartVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    setHasEnded(false);
    video.currentTime = 0;
    void video.play().catch(() => {});
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.ended || hasEnded) {
      restartVideo();
      return;
    }
    if (video.paused) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const seekToClientX = useCallback((clientX: number) => {
    const video = videoRef.current;
    const track = scrubTrackRef.current;
    if (!video?.duration || !track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = (clientX - rect.left) / rect.width;
    video.currentTime =
      Math.min(1, Math.max(0, fraction)) * video.duration;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.75) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: [0, 0.75, 1] }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="w-full">
      <h2 className="mb-4 flex items-center gap-1.5 text-lg font-normal text-muted-foreground">
        See ThinkEx in action
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
      </h2>
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden border border-border/50 shadow-2xl bg-black aspect-video group"
      >
        {hasDemoVideo ? (
          <>
            <video
              ref={videoRef}
              src={DEMO_VIDEO_SRC}
              muted
              playsInline
              className="w-full h-full cursor-pointer object-cover"
              onClick={togglePlayPause}
              onPlay={() => {
                setIsPlaying(true);
                setHasEnded(false);
                setHasPlayStarted(true);
              }}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setHasEnded(true)}
              onTimeUpdate={() => {
                const video = videoRef.current;
                if (video?.duration) {
                  setProgress((video.currentTime / video.duration) * 100);
                }
              }}
            >
              Your browser does not support the video tag.
            </video>
            {hasEnded ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/45">
                <button
                  type="button"
                  onClick={restartVideo}
                  className={overlayButtonClass}
                  aria-label="Replay demo video"
                >
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M1 4v6h6" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  <span className="text-sm font-medium tracking-wide">
                    Watch again
                  </span>
                </button>
              </div>
            ) : hasPlayStarted && !isPlaying ? (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center bg-black/45"
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    void videoRef.current?.play().catch(() => {});
                  }
                }}
                role="presentation"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const video = videoRef.current;
                    if (!video) return;
                    void video.play().catch(() => {});
                  }}
                  className={overlayButtonClass}
                  aria-label="Resume demo video"
                >
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                  >
                    <rect x="6" y="5" width="5" height="14" rx="1" />
                    <rect x="13" y="5" width="5" height="14" rx="1" />
                  </svg>
                  <span className="text-sm font-medium tracking-wide">
                    Resume
                  </span>
                </button>
              </div>
            ) : null}
            <div
              className={`pointer-events-none absolute inset-x-0 bottom-0 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 ${hasEnded ? "z-[5]" : "z-[15]"}`}
            >
              <div
                ref={scrubTrackRef}
                className="flex h-8 cursor-grab touch-none select-none items-end px-3 pb-1.5 active:cursor-grabbing"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  seekToClientX(e.clientX);
                }}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  e.stopPropagation();
                  seekToClientX(e.clientX);
                }}
                onPointerUp={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                }}
                onPointerCancel={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                }}
              >
                <div className="relative h-1 w-full overflow-hidden rounded-full bg-[color-mix(in_oklch,oklch(0.22_0_0)_72%,oklch(1_0_0)_28%)] shadow-[0_0_0_1px_rgba(0,0,0,0.22),0_1px_2px_rgba(0,0,0,0.35)]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-[color-mix(in_oklch,oklch(1_0_0)_88%,var(--primary)_12%)]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-background/80 to-primary/5">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-primary" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-foreground">Demo video coming soon</p>
            <p className="text-sm text-muted-foreground mt-1">See how ThinkEx transforms your workflow</p>
          </div>
        )}
      </div>
    </div>
  );
}
