import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import type { MouseEvent } from "react";

import { ModeToggle } from "#/components/mode-toggle";
import { PublicNavLinks } from "#/components/PublicNavLinks";
import ThinkExLogo from "#/components/ThinkExLogo";
import { Button } from "#/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "#/components/ui/sheet";
import { useMarketingHomePath } from "#/components/use-marketing-home-path";
import { isPlainLeftClick } from "#/lib/plain-link-click";
import { smoothScrollViewportTop } from "#/lib/smooth-scroll";

interface PublicHeaderProps {
	signedIn?: boolean;
}

export function PublicHeader({ signedIn = false }: PublicHeaderProps) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const marketingHome = useMarketingHomePath();

	function handleHomeLogoClick(event: MouseEvent<HTMLAnchorElement>) {
		if (!isPlainLeftClick(event)) {
			return;
		}

		// Already on the page the logo points at, so scroll rather than navigate.
		if (pathname === marketingHome) {
			event.preventDefault();
			smoothScrollViewportTop();
		}
	}

	return (
		<header className="sticky top-0 z-40 shrink-0 border-b border-border bg-background/95 backdrop-blur dark:bg-black/95">
			<div className="relative mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-6">
				<Link
					to={marketingHome}
					onClick={handleHomeLogoClick}
					className="flex items-center gap-3 rounded-md text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Back to ThinkEx home"
				>
					<ThinkExLogo size={28} />
					<span className="text-xl font-semibold tracking-tight sm:text-2xl">ThinkEx</span>
				</Link>

				<nav
					className="pointer-events-none absolute inset-x-48 hidden justify-center lg:flex"
					aria-label="Primary"
				>
					<PublicNavLinks className="pointer-events-auto flex items-center gap-6" />
				</nav>

				<nav className="ml-auto hidden items-center gap-3 lg:flex" aria-label="Account">
					<ModeToggle className="size-9" />
					<Button nativeButton={false} render={<Link to={signedIn ? "/home" : "/login"} />}>
						{signedIn ? "Home" : "Get started"}
					</Button>
				</nav>

				<div className="ml-auto flex items-center gap-2 lg:hidden">
					<ModeToggle className="size-9" />
					<Sheet>
						<SheetTrigger
							render={<Button variant="outline" size="icon" aria-label="Open site menu" />}
						>
							<Menu className="size-4" />
						</SheetTrigger>
						<SheetContent
							side="top"
							animated={false}
							aria-label="Site menu"
							className="min-h-[17rem] gap-0 bg-background px-4 pt-16 pb-5 dark:bg-black"
						>
							<Link
								to={marketingHome}
								onClick={handleHomeLogoClick}
								className="absolute top-0 left-6 flex h-14 items-center gap-3 rounded-md text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<ThinkExLogo size={28} />
								<span className="text-xl font-semibold tracking-tight">ThinkEx</span>
							</Link>
							<div className="mx-auto grid w-full max-w-sm gap-3">
								<PublicNavLinks
									className="grid gap-3 py-1 text-center"
									linkClassName="mx-auto inline-flex h-9 items-center justify-center text-base"
								/>
								<Button
									nativeButton={false}
									render={<Link to={signedIn ? "/home" : "/login"} />}
									size="lg"
									className="h-12"
								>
									{signedIn ? "Home" : "Get started"}
								</Button>
							</div>
						</SheetContent>
					</Sheet>
				</div>
			</div>
		</header>
	);
}
