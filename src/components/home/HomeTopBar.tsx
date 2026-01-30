"use client";

import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { UserProfileDropdown } from "./UserProfileDropdown";

interface HomeTopBarProps {
  scrollY: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function HomeTopBar({ scrollY, searchQuery, onSearchChange }: HomeTopBarProps) {
  // Show search bar after scrolling past hero content (300px)
  const showSearch = scrollY > 300;
  // Background: starts fading at 200px, fully opaque at 500px
  const bgOpacity = Math.min(Math.max((scrollY - 200) / 300, 0), 1);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 h-16",
        "flex items-center justify-between px-6",
        "transition-all duration-300"
      )}
      style={{
        backgroundColor: `rgba(0, 0, 0, ${bgOpacity})`,
      }}
    >
      {/* Left: Logo */}
      <Link href="/home" className="flex items-center gap-2 group">
        <div className="relative h-6 w-6 flex items-center justify-center transition-transform group-hover:scale-105">
          <Image
            src="/newlogothinkex.svg"
            alt="ThinkEx Logo"
            width={24}
            height={24}
            className="object-contain"
          />
        </div>
        <span className="text-lg font-medium whitespace-nowrap">ThinkEx</span>
      </Link>

      {/* Center: Search bar (appears on scroll) */}
      <div
        className={cn(
          "absolute left-1/2 -translate-x-1/2",
          "transition-all duration-300",
          showSearch
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        )}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" aria-hidden="true" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search workspaces..."
            aria-label="Search workspaces"
            className={cn(
              "w-96 pl-9 h-9",
              "bg-background/80 backdrop-blur-xl",
              "border border-white/10 rounded-lg",
              "shadow-[0_0_30px_-10px_rgba(255,255,255,0.1)]",
              "focus:shadow-[0_0_40px_-8px_rgba(255,255,255,0.15)]",
              "focus:border-white/20",
              "placeholder:text-muted-foreground/50",
              "transition-all duration-300"
            )}
          />
        </div>
      </div>

      {/* Right: User profile */}
      <UserProfileDropdown />
    </header>
  );
}
