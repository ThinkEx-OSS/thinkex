"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";


export function Footer() {
  const currentYear = new Date().getFullYear();
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText("hello@thinkex.app");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy email:", err);
    }
  };

  return (
    <footer className="relative px-4 md:px-0 py-6 md:py-8">
      {/* Big Watermark Text */}
      <div className="absolute bottom-[0%] md:bottom-[-12%] left-1/2 -translate-x-1/2 w-full text-center pointer-events-none select-none overflow-hidden z-0 opacity-[0.03]">
        <span className="text-[25vw] md:text-[18vw] font-normal leading-none tracking-tighter whitespace-nowrap text-foreground">
          ThinkEx
        </span>
      </div>

      <div className="relative z-10 mx-auto max-w-[95%]">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 md:gap-8">

          {/* Brand Column */}
          <div className="col-span-2 md:col-span-6 space-y-6">
            <Link href="#hero" className="flex items-center group w-fit">
              <div className="relative h-8 w-8 flex items-center justify-center transition-transform group-hover:scale-105">
                <Image
                  src="/newlogothinkex.svg"
                  alt="ThinkEx Logo"
                  width={32}
                  height={32}
                  className="object-contain"
                />
              </div>
            </Link>

            <button
              onClick={handleCopyEmail}
              className="block text-lg font-medium text-foreground hover:text-muted-foreground transition-colors cursor-pointer text-left"
            >
              {copied ? "Copied!" : "hello@thinkex.app"}
            </button>

            <div className="text-sm text-muted-foreground/60 max-w-md leading-relaxed">
              <p>
                Building in the AI productivity market, ThinkEx is a visual thinking environment where notes, media, and AI conversations compound into lasting knowledge.
              </p>
              <p className="mt-2 italic">
                <span className="text-foreground/80">Status:</span> v1.0 publicly available
              </p>
            </div>

            <div className="flex flex-row flex-wrap items-center gap-4 text-sm text-muted-foreground/60 pt-6 hidden md:flex">
              <span className="opacity-70">© {currentYear} ThinkEx Inc. All rights reserved.</span>
              <Link href="#" className="hover:text-foreground transition-colors cursor-not-allowed opacity-70 w-fit">Privacy Policy</Link>
              <Link href="#" className="hover:text-foreground transition-colors cursor-not-allowed opacity-70 w-fit">Terms of Service</Link>
              <Link href="#" className="hover:text-foreground transition-colors cursor-not-allowed opacity-70 w-fit">Cookie Policy</Link>
            </div>
          </div>

          {/* Product Column */}
          <div className="col-span-1 md:col-span-3 space-y-6">
            <h3 className="font-semibold text-foreground">Product</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="#hero" className="hover:text-foreground transition-colors">Home</Link></li>
              <li><Link href="#four-ways" className="hover:text-foreground transition-colors">Product</Link></li>
              <li><Link href="#use-cases" className="hover:text-foreground transition-colors">Use Cases</Link></li>
              <li><Link href="#comparison" className="hover:text-foreground transition-colors">Comparison</Link></li>
              <li><Link href="#pricing" className="hover:text-foreground transition-colors">Pricing</Link></li>
            </ul>
          </div>

          {/* Community Column */}
          <div className="col-span-1 md:col-span-3 space-y-6">
            <h3 className="font-semibold text-foreground">Community</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <a href="https://github.com/thinkex-oss/thinkex" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-foreground transition-colors">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
                  GitHub
                </a>
              </li>
              <li>
                <a href="https://discord.gg/jTZJqwKVVQ" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-foreground transition-colors">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 13.433 13.433 0 0 0-.64 1.289 18.237 18.237 0 0 0-7.424 0 13.568 13.568 0 0 0-.649-1.29.074.074 0 0 0-.078-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" /></svg>
                  Discord
                </a>
              </li>
              <li>
                <a href="https://reddit.com/r/thinkex" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-foreground transition-colors">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" /></svg>
                  Reddit
                </a>
              </li>
              <li>
                <a href="https://x.com/trythinkex" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-foreground transition-colors">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                  Twitter / X
                </a>
              </li>
            </ul>
          </div>



          {/* Mobile Only: Legal/Copyright at Bottom */}
          <div className="col-span-2 md:hidden space-y-4 pt-4 mt-4 border-t border-foreground/5">
            <div className="flex flex-col gap-2 text-sm text-muted-foreground/60">
              <span className="opacity-70">© {currentYear} ThinkEx Inc. All rights reserved.</span>
              <Link href="#" className="hover:text-foreground transition-colors cursor-not-allowed opacity-70 w-fit">Privacy Policy</Link>
              <Link href="#" className="hover:text-foreground transition-colors cursor-not-allowed opacity-70 w-fit">Terms of Service</Link>
              <Link href="#" className="hover:text-foreground transition-colors cursor-not-allowed opacity-70 w-fit">Cookie Policy</Link>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Legal */}
        {/* Bottom Bar Removed */}
      </div>
    </footer>
  );
}
