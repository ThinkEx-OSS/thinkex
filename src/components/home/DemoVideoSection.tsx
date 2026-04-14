"use client";

const DEMO_VIDEO_SRC = "/demo.mp4";

export function DemoVideoSection() {
  return (
    <div className="w-full">
      <h2 className="text-lg font-normal text-muted-foreground mb-4">
        See ThinkEx in action
      </h2>
      <div className="relative rounded-2xl overflow-hidden border border-border/50 shadow-2xl bg-black aspect-video">
        <video
          src={DEMO_VIDEO_SRC}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover"
        >
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  );
}
