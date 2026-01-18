"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Linkedin } from "lucide-react";

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
    <footer className="relative px-6 md:px-4 pt-8 pb-12 md:py-20 overflow-hidden">
      {/* Big Watermark Text */}
      <div className="absolute bottom-[0%] md:bottom-[-12%] left-1/2 -translate-x-1/2 w-full text-center pointer-events-none select-none overflow-hidden z-0 opacity-[0.03]">
        <span className="text-[25vw] md:text-[18vw] font-normal leading-none tracking-tighter whitespace-nowrap text-foreground">
          ThinkEx
        </span>
      </div>

      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 md:gap-8">

          {/* Brand Column */}
          <div className="col-span-2 md:col-span-5 space-y-6">
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

            <div className="space-y-4 pt-6 hidden md:block">
              <div className="text-sm text-muted-foreground/60">
                <p>© {currentYear} ThinkEx Inc. All rights reserved.</p>
              </div>
              <div className="flex flex-row flex-wrap gap-4 text-sm text-muted-foreground/60">
                <Link href="#" className="hover:text-foreground transition-colors cursor-not-allowed opacity-70 w-fit">Privacy Policy</Link>
                <Link href="#" className="hover:text-foreground transition-colors cursor-not-allowed opacity-70 w-fit">Terms of Service</Link>
                <Link href="#" className="hover:text-foreground transition-colors cursor-not-allowed opacity-70 w-fit">Cookie Policy</Link>
              </div>
            </div>
          </div>

          {/* Product Column */}
          <div className="col-span-1 md:col-span-3 space-y-6">
            <h3 className="font-semibold text-foreground">Product</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="#hero" className="hover:text-foreground transition-colors">Home</Link></li>
              <li><Link href="#four-ways" className="hover:text-foreground transition-colors">Features</Link></li>
              <li><Link href="#comparison" className="hover:text-foreground transition-colors">Comparison</Link></li>
              <li><Link href="#pricing" className="hover:text-foreground transition-colors">Pricing</Link></li>
              <li><a href="https://github.com/thinkex-oss/thinkex" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">GitHub</a></li>
            </ul>
          </div>

          {/* Team Column */}
          <div className="col-span-1 md:col-span-4 space-y-6">
            <h3 className="font-semibold text-foreground">Team</h3>
            <ul className="space-y-4">
              <li>
                <div className="flex items-start gap-2">
                  <a
                    href="https://www.linkedin.com/in/ishaan-chakraborty-7993b524a/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-[#0077b5] transition-colors mt-0.5"
                    aria-label="Ishaan Chakraborty LinkedIn"
                  >
                    <Linkedin className="h-4 w-4" />
                  </a>
                  <div className="flex flex-col md:flex-row md:items-baseline gap-0.5 md:gap-2">
                    <span className="text-sm font-medium text-foreground">Ishaan Chakraborty</span>
                    <span className="text-xs md:text-sm text-muted-foreground leading-tight">CEO | Prev. MLOps @ Children's National Hospital</span>
                  </div>
                </div>
              </li>
              <li>
                <div className="flex items-start gap-2">
                  <a
                    href="https://www.linkedin.com/in/urjit-chakraborty-6b855b260/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-[#0077b5] transition-colors mt-0.5"
                    aria-label="Urjit Chakraborty LinkedIn"
                  >
                    <Linkedin className="h-4 w-4" />
                  </a>
                  <div className="flex flex-col md:flex-row md:items-baseline gap-0.5 md:gap-2">
                    <span className="text-sm font-medium text-foreground">Urjit Chakraborty</span>
                    <span className="text-xs md:text-sm text-muted-foreground leading-tight">CTO | Prev. Backend @ Exiger</span>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          {/* Mobile Only: Legal/Copyright at Bottom */}
          <div className="col-span-2 md:hidden space-y-4 pt-4 mt-4 border-t border-foreground/5">
            <div className="text-sm text-muted-foreground/60">
              <p>© {currentYear} ThinkEx Inc. All rights reserved.</p>
            </div>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground/60">
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
