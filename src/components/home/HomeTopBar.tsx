"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { UserProfileDropdown } from "./UserProfileDropdown";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";
import type { InitialAuth } from "./HomeShell";

interface HomeTopBarProps {
  showBackground: boolean;
  showSearch: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  initialAuth: InitialAuth;
}

export function HomeTopBar({ showBackground, showSearch, searchQuery, onSearchChange, initialAuth }: HomeTopBarProps) {
  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50",
        "flex items-center justify-between px-3 py-1",
        "transition-all duration-300"
      )}
      style={{
        backgroundColor: showBackground ? `hsl(240 5.9% 10% / 0.18)` : "transparent",
      }}
    >
      <Link href="/home" className="flex items-center gap-2 group">
        <div className="relative h-6 w-6 flex items-center justify-center transition-transform group-hover:scale-105">
          <ThinkExLogo size={24} priority />
        </div>
        <span className="text-lg font-medium whitespace-nowrap">ThinkEx</span>
      </Link>

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

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserProfileDropdown initialAuth={initialAuth} />
      </div>
    </header>
  );
}
