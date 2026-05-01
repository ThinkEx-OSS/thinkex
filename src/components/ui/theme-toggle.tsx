"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const sizeStyles = {
  sm: {
    btn: "h-8 w-8",
    icon: "h-4 w-4",
  },
  md: {
    btn: "h-10 w-10",
    icon: "h-5 w-5",
  },
} as const;

type ThemeToggleProps = {
  size?: keyof typeof sizeStyles;
};

export function ThemeToggle({ size = "sm" }: ThemeToggleProps) {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // useEffect only runs on the client, so now we can safely show the UI
  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const isDark = theme === "dark";

  const s = sizeStyles[size];

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "relative shrink-0 p-0 text-foreground transition-colors hover:bg-muted hover:text-muted-foreground",
        s.btn,
      )}
    >
      <Sun
        className={cn(
          s.icon,
          "rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0",
        )}
      />
      <Moon
        className={cn(
          "absolute inset-0 m-auto",
          s.icon,
          "rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100",
        )}
      />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
