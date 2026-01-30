"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Menu, Github } from "lucide-react";
import { useState, useEffect } from "react";
import { usePostHog } from 'posthog-js/react';
import { useSession } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { signOut } from "@/lib/auth-client";
import { AccountModal } from "@/components/auth/AccountModal";

export function Navbar() {
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);
  const posthog = usePostHog();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Check on mount
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Observe the hero CTA button visibility
  useEffect(() => {
    const heroCta = document.getElementById("hero-cta");
    if (!heroCta) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setHeroCtaVisible(entry.isIntersecting);
      },
      { threshold: 0 }
    );

    observer.observe(heroCta);
    return () => observer.disconnect();
  }, []);

  const userName = session?.user?.name || session?.user?.email || "User";
  const userEmail = session?.user?.email || "";
  const userImage = session?.user?.image || undefined;

  const getInitials = (name: string) => {
    if (name === "User") return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const navLinks = [
    { href: "#four-ways", label: "Product" },
    { href: "#use-cases", label: "Use Cases" },
    { href: "#comparison", label: "Compare" },
    { href: "#pricing", label: "Pricing" },
  ];

  return (
    <>
      <nav
        className={`sticky top-0 z-50 transition-[padding] duration-500 ease-in-out ${isScrolled ? "pt-2" : "pt-0"
          }`}
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div
            className={`
              relative flex items-center justify-between p-3
              transition-all duration-300 ease-out
              ${isScrolled
                ? "rounded-md border border-gray-500/30 bg-background"
                : "rounded-none border-0 border-transparent bg-transparent"
              }
            `}
          >
            {/* Logo/Brand */}
            <Link href="#hero" className="flex items-center gap-2 group z-10">
              <div className="relative h-8 w-8 flex items-center justify-center transition-transform group-hover:scale-105">
                <Image
                  src="/newlogothinkex.svg"
                  alt="ThinkEx Logo"
                  width={32}
                  height={32}
                  className="object-contain"
                  priority
                />
              </div>
              <span className="text-2xl font-normal text-foreground">ThinkEx</span>
            </Link>

            {/* Desktop Navigation - Centered */}
            <div className="hidden md:flex md:items-center md:gap-8 absolute left-1/2 -translate-x-1/2">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault();
                    const element = document.querySelector(link.href);
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }}
                  className="text-base font-normal text-foreground/70 transition-colors hover:text-foreground cursor-pointer"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Desktop CTA */}
            <div className="hidden md:flex md:items-center md:gap-4 z-10">
              {!isPending && !session && (
                <>

                  <Link
                    href="/auth/sign-in"
                    className="rounded-md px-4 py-2 text-base font-normal bg-foreground/5 text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground cursor-pointer"
                  >
                    Log in
                  </Link>
                  <div
                    className={`transition-all duration-300 ease-out overflow-hidden ${!heroCtaVisible
                      ? "opacity-100 max-w-[150px]"
                      : "opacity-0 max-w-0 pointer-events-none"
                      }`}
                  >
                    <Button
                      asChild
                      onClick={() => posthog.capture('navbar-get-started-clicked', { location: 'desktop' })}
                      size="default"
                      className="rounded-md bg-foreground font-medium text-background transition-all hover:bg-foreground/90"
                    >
                      <Link href="/home" prefetch>
                        Get Started
                      </Link>
                    </Button>
                  </div>
                </>
              )}
              {!isPending && session && (
                <>
                  <Button
                    asChild
                    onClick={() => posthog.capture('navbar-dashboard-clicked', { location: 'desktop' })}
                    size="sm"
                    variant="outline"
                    className="rounded-md font-medium transition-all hover:bg-foreground/5"
                  >
                    <Link href="/home" prefetch>
                      Dashboard
                    </Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="relative h-9 w-9 rounded-full">
                        <Avatar className="h-9 w-9">
                          {userImage && <AvatarImage src={userImage} alt={userName} />}
                          <AvatarFallback className="bg-primary/10 text-xs">
                            {getInitials(userName)}
                          </AvatarFallback>
                        </Avatar>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <div className="px-2 py-1.5">
                        <p className="text-sm font-medium">{userName}</p>
                        {userEmail && (
                          <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                        )}
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setShowAccountModal(true)}
                        className="cursor-pointer"
                      >
                        Account Settings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => signOut()}
                        className="cursor-pointer"
                      >
                        Sign Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>

            {/* Mobile menu dropdown */}
            <div className="md:hidden z-10">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="Toggle menu"
                  >
                    <Menu className="h-8 w-8" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {navLinks.map((link) => (
                    <DropdownMenuItem
                      key={link.href}
                      onClick={(e) => {
                        e.preventDefault();
                        const element = document.querySelector(link.href);
                        if (element) {
                          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }}
                      className="cursor-pointer"
                    >
                      {link.label}
                    </DropdownMenuItem>
                  ))}
                  {!isPending && !session && (
                    <>
                      <DropdownMenuSeparator />

                      <DropdownMenuItem asChild>
                        <Link
                          href="/auth/sign-in"
                          className="cursor-pointer"
                        >
                          Log in
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link
                          href="/home"
                          onClick={() => posthog.capture('navbar-get-started-clicked', { location: 'mobile' })}
                          className="cursor-pointer"
                        >
                          Get Started
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  {!isPending && session && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link
                          href="/home"
                          onClick={() => posthog.capture('navbar-dashboard-clicked', { location: 'mobile' })}
                          className="cursor-pointer"
                        >
                          Dashboard
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1.5">
                        <p className="text-sm font-medium">{userName}</p>
                        {userEmail && (
                          <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                        )}
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setShowAccountModal(true)}
                        className="cursor-pointer"
                      >
                        Account Settings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => signOut()}
                        className="cursor-pointer"
                      >
                        Sign Out
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <AccountModal
          open={showAccountModal}
          onOpenChange={setShowAccountModal}
        />
      </nav>
    </>
  );
}


