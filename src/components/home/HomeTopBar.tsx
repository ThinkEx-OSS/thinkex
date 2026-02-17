"use client";

import Link from "next/link";
import { Github, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { UserProfileDropdown } from "./UserProfileDropdown";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";

interface HomeTopBarProps {
  scrollY: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function HomeTopBar({ scrollY, searchQuery, onSearchChange }: HomeTopBarProps) {
  // Show search bar after scrolling past hero content (300px) — unmount when hidden so autoFocus runs when it mounts
  const showSearch = scrollY > 300;
  // Background: starts fading at 200px, fully opaque at 500px
  const bgOpacity = Math.min(Math.max((scrollY - 200) / 300, 0), 1);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50",
        "flex items-center justify-between px-3 py-1",
        "transition-all duration-300"
      )}
      style={{
        backgroundColor: `hsl(240 5.9% 10% / ${0.18 * bgOpacity})`,
      }}
    >
      {/* Left: Logo */}
      <Link href="/home" className="flex items-center gap-2 group">
        <div className="relative h-6 w-6 flex items-center justify-center transition-transform group-hover:scale-105">
          <ThinkExLogo size={24} />
        </div>
        <span className="text-lg font-medium whitespace-nowrap">ThinkEx</span>
      </Link>

      {/* Center: Search bar (mounted when visible so autoFocus works) */}
      {showSearch && (
        <div className="absolute left-1/2 -translate-x-1/2 transition-all duration-300">
          <div
            className={cn(
              "relative flex items-center gap-0 h-10 w-96",
              "bg-background/80 backdrop-blur-xl",
              "border border-white/10 rounded-xl",
              "shadow-[0_0_60px_-15px_rgba(255,255,255,0.1)]",
              "focus-within:shadow-[0_0_80px_-10px_rgba(255,255,255,0.15)]",
              "focus-within:border-white/30",
              "cursor-text"
            )}
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" aria-hidden="true" />
            <Input
              autoFocus
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search workspaces..."
              aria-label="Search workspaces"
              className={cn(
                "w-full border-0 pl-9",
                "focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0",
                "text-sm",
                "bg-transparent dark:bg-transparent",
                "h-auto",
                "placeholder:text-muted-foreground/50"
              )}
            />
          </div>
        </div>
      )}

      {/* Right: Theme toggle + Open source + User profile */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <a
          href="https://github.com/thinkex-oss/thinkex"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md text-foreground hover:text-muted-foreground transition-colors"
        >
          <Github className="h-4 w-4" />
        </a>
        <UserProfileDropdown />
      </div>
    </header>
  );
}
