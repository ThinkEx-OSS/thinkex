"use client";

interface HomeLayoutProps {
  children: React.ReactNode;
}

/**
 * Simplified layout for home page.
 * No sidebar - uses a top bar navigation instead.
 * Home content manages its own layout and hero sections.
 */
export function HomeLayout({ children }: HomeLayoutProps) {
  return (
    <div className="h-screen w-full overflow-hidden">
      <div className="h-full overflow-hidden relative z-10">
        {children}
      </div>
    </div>
  );
}
