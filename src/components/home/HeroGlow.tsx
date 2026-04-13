"use client";

export function HeroGlow() {
  return (
    <>
      <div
        className="absolute -inset-20 rounded-3xl pointer-events-none dark:hidden"
        style={{
          background: `radial-gradient(ellipse at center,
            rgba(156, 146, 250, 0.25) 0%,
            rgba(167, 139, 250, 0.2) 35%,
            rgba(140, 130, 220, 0.08) 80%,
            rgba(130, 120, 200, 0.04) 100%)`,
          filter: "blur(32px)",
          zIndex: 0,
        }}
      />
      <div
        className="absolute -inset-20 hidden rounded-3xl pointer-events-none dark:block"
        style={{
          background: `radial-gradient(ellipse at center,
            rgba(156, 146, 250, 0.65) 0%,
            rgba(167, 139, 250, 0.55) 35%,
            rgba(140, 130, 220, 0.14) 80%,
            rgba(130, 120, 200, 0.06) 100%)`,
          filter: "blur(32px)",
          zIndex: 0,
        }}
      />
      <div
        className="absolute -inset-8 hidden rounded-3xl pointer-events-none dark:block"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.25) 40%, transparent 70%)",
          filter: "blur(10px)",
          zIndex: 1,
        }}
      />
    </>
  );
}
