import type { ReactNode } from "react";
import Link from "next/link";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";
import { LegalFooterLinks } from "./LegalFooterLinks";

export default function LegalLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-12">
        <header className="mb-10 flex flex-col items-center gap-4 text-center">
          <Link
            href="/home"
            aria-label="Go to ThinkEx home"
            className="flex items-center justify-center transition-opacity hover:opacity-80"
          >
            <ThinkExLogo size={32} />
          </Link>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">ThinkEx Legal</p>
            <p className="text-sm text-muted-foreground">
              Policies and terms for using https://thinkex.app
            </p>
          </div>
        </header>

        <main className="flex-1">
          <article className="prose prose-neutral max-w-none text-foreground dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/90 prose-li:text-foreground/90 prose-strong:text-foreground prose-a:text-foreground prose-a:underline prose-a:underline-offset-4">
            {children}
          </article>
        </main>

        <footer className="mt-12 border-t border-border pt-6">
          <LegalFooterLinks />
        </footer>
      </div>
    </div>
  );
}
