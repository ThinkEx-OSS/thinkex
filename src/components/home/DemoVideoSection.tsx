"use client";

import { useEffect, useRef, useState } from "react";

const DEMO_VIDEO_SRC = "";
const hasDemoVideo = DEMO_VIDEO_SRC.length > 0;

export function DemoVideoSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="w-full">
      <h2 className="text-lg font-normal text-muted-foreground mb-4">
        See ThinkEx in action
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
              loop
              playsInline
              className="w-full h-full object-cover"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={() => {
                const video = videoRef.current;
                if (video && video.duration) {
                  setProgress((video.currentTime / video.duration) * 100);
                }
              }}
            />
            <div className="absolute bottom-0 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <div
                className="w-full h-1 bg-white/20 cursor-pointer hover:h-1.5 transition-all"
                onClick={(e) => {
                  const video = videoRef.current;
                  if (!video) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  video.currentTime =
                    ((e.clientX - rect.left) / rect.width) * video.duration;
                }}
              >
                <div
                  className="h-full bg-white/80 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-black/40 backdrop-blur-sm">
                <button
                  onClick={() => {
                    const video = videoRef.current;
                    if (!video) return;
                    if (video.paused) {
                      video.play().catch(() => {});
                      return;
                    }
                    video.pause();
                  }}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  {isPlaying ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => {
                    const video = videoRef.current;
                    if (!video) return;
                    video.currentTime = 0;
                    video.play().catch(() => {});
                  }}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 4v6h6" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-background/80 to-primary/5">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-primary"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-foreground">
              Demo video coming soon
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              See how ThinkEx transforms your workflow
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
