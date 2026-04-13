"use client";

const DEMO_VIDEO_SRC = "";
const hasDemoVideo = DEMO_VIDEO_SRC.length > 0;

export function DemoVideoSection() {
  return (
    <div className="w-full max-w-4xl mx-auto">
      <h2 className="text-lg font-normal text-muted-foreground mb-4">
        See ThinkEx in action
      </h2>
      <div className="relative rounded-2xl overflow-hidden border border-border/50 shadow-2xl bg-black aspect-video">
        {hasDemoVideo ? (
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
