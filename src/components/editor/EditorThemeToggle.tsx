"use client"

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button"

// --- Icons ---
import { Moon } from "lucide-react"
import { Sun } from "lucide-react"
import { useSyncExternalStore, useState, useEffect } from "react"

function usePrefersDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () =>
      !!document.querySelector('meta[name="color-scheme"][content="dark"]') ||
      window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false
  );
}

export function EditorThemeToggle() {
  const prefersDark = usePrefersDark();
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);
  const isDarkMode = manualOverride ?? prefersDark;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  const toggleDarkMode = () => setManualOverride(prev =>
    prev === null ? !prefersDark : !prev
  );

  return (
    <Button
      onClick={toggleDarkMode}
      aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
      variant="ghost"
    >
      {isDarkMode ? (
        <Moon className="tiptap-button-icon" />
      ) : (
        <Sun className="tiptap-button-icon" />
      )}
    </Button>
  )
}
