import { Link } from "@tanstack/react-router";

import { ModeToggle } from "#/components/mode-toggle";
import { PublicNavLinks } from "#/components/PublicNavLinks";
import SiteFooter from "#/components/SiteFooter";
import ThinkExLogo from "#/components/ThinkExLogo";
import { Button } from "#/components/ui/button";

type BlogShellProps = {
	children: React.ReactNode;
};

export function BlogShell({ children }: BlogShellProps) {
	return (
		<div
			data-app-shell
			className="flex min-h-screen flex-col bg-background text-foreground dark:bg-black"
		>
			<header className="sticky top-0 z-40 shrink-0 border-b border-border bg-background/95 backdrop-blur dark:bg-black/95">
				<div className="relative mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-6">
					<Link
						to="/"
						className="flex items-center gap-3 rounded-md text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
						aria-label="Back to ThinkEx home"
					>
						<ThinkExLogo size={28} />
						<span className="text-xl font-semibold tracking-tight sm:text-2xl">ThinkEx</span>
					</Link>

					<nav
						className="pointer-events-none absolute inset-x-48 hidden justify-center lg:flex"
						aria-label="Blog"
					>
						<PublicNavLinks className="pointer-events-auto flex items-center gap-6" />
					</nav>

					<div className="ml-auto flex items-center gap-2">
						<ModeToggle className="size-9" />
						<Button nativeButton={false} render={<Link to="/login" />} variant="outline" size="sm">
							Sign in
						</Button>
						<Button nativeButton={false} render={<Link to="/login" />} size="sm">
							Get started
						</Button>
					</div>
				</div>
			</header>

			<main className="flex-1">{children}</main>
			<SiteFooter />
		</div>
	);
}
