"use client"

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button"

// --- Icons ---
import { Moon } from "lucide-react"
import { Sun } from "lucide-react"
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => setIsDarkMode(mediaQuery.matches)
    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  useEffect(() => {
    const initialDarkMode =
      !!document.querySelector('meta[name="color-scheme"][content="dark"]') ||
      window.matchMedia("(prefers-color-scheme: dark)").matches
    setIsDarkMode(initialDarkMode)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode)
  }, [isDarkMode])

  const toggleDarkMode = () => setIsDarkMode((isDark) => !isDark)

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
