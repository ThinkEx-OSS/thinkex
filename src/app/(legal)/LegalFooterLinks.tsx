"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const legalLinks = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/cookies", label: "Cookie Policy" },
] as const;

export function LegalFooterLinks() {
  const pathname = usePathname();
  const links = legalLinks.filter((link) => link.href !== pathname);

  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className="underline underline-offset-4 transition-colors hover:text-foreground"
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
