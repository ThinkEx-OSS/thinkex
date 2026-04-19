import Link from "next/link";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";

export function LandingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative border-t border-border/50 px-4 py-10 md:py-14">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-2">
          <ThinkExLogo size={32} />
          <span className="text-base font-semibold">ThinkEx</span>
        </div>
        <p className="max-w-md text-sm text-muted-foreground">
          A visual thinking workspace where your docs, media, and AI come
          together.
        </p>
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm">
          <li>
            <Link
              href="/privacy"
              className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link
              href="/terms"
              className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Terms of Service
            </Link>
          </li>
          <li>
            <Link
              href="/cookies"
              className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Cookie Policy
            </Link>
          </li>
          <li>
            <a
              href="mailto:hello@thinkex.app"
              className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              hello@thinkex.app
            </a>
          </li>
          <li>
            <a
              href="https://github.com/ThinkEx-OSS/thinkex"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              GitHub
            </a>
          </li>
          <li>
            <a
              href="https://discord.gg/jTZJqwKVVQ"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Discord
            </a>
          </li>
          <li>
            <a
              href="https://x.com/trythinkex"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Twitter / X
            </a>
          </li>
        </ul>
        <div className="w-full border-t border-border/50 pt-6">
          <p className="text-xs text-muted-foreground/70">
            © {currentYear} ThinkEx Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
