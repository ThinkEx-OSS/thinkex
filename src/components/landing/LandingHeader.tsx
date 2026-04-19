import Link from "next/link";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";

export function LandingHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2"
          aria-label="ThinkEx home"
        >
          <ThinkExLogo size={24} priority />
          <span className="text-lg font-semibold">ThinkEx</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm md:gap-2">
          <Link
            href="/privacy"
            className="hidden h-9 items-center justify-center rounded-md px-3 text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="hidden h-9 items-center justify-center rounded-md px-3 text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Terms
          </Link>
          <a
            href="https://github.com/ThinkEx-OSS/thinkex"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden h-9 items-center justify-center rounded-md px-3 text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
          >
            GitHub
          </a>
          <Link
            href="/auth/sign-in"
            className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            Sign in
          </Link>
          <Link
            href="/auth/sign-up"
            className="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Sign up
          </Link>
        </nav>
      </div>
    </header>
  );
}
