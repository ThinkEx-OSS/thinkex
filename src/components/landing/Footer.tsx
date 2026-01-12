import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Linkedin } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-foreground/10 px-4 py-8 md:py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <Link href="#hero" className="inline-flex items-center justify-center gap-2 group">
            <div className="relative h-6 w-6 flex items-center justify-center transition-transform group-hover:scale-105">
              <Image
                src="/newlogothinkex.svg"
                alt="ThinkEx Logo"
                width={24}
                height={24}
                className="object-contain"
                priority
              />
            </div>
            <span className="text-xl font-normal text-foreground">ThinkEx</span>
          </Link>
        </div>

        {/* Built By */}
        <div className="mt-4 text-center">
          <p className="text-sm text-muted-foreground mb-3">Built By:</p>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              asChild
              className="text-xs"
            >
              <a
                href="https://www.linkedin.com/in/urjit-chakraborty-6b855b260/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5"
              >
                <Linkedin className="h-3 w-3" />
                Urjit Chakraborty
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="text-xs"
            >
              <a
                href="https://www.linkedin.com/in/ishaan-chakraborty-7993b524a/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5"
              >
                <Linkedin className="h-3 w-3" />
                Ishaan Chakraborty
              </a>
            </Button>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            © {currentYear} ThinkEx Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

