import { Link, useRouterState } from "@tanstack/react-router";

import { ModeToggle } from "#/components/mode-toggle";
import SiteFooter from "#/components/SiteFooter";
import ThinkExLogo from "#/components/ThinkExLogo";
import { Button } from "#/components/ui/button";
import { CyclingWord } from "#/components/ui/cycling-word";
import { smoothScrollViewportTop } from "#/lib/smooth-scroll";

export default function LandingPage() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	function handleHomeLogoClick(event: React.MouseEvent<HTMLAnchorElement>) {
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		) {
			return;
		}

		if (pathname === "/") {
			event.preventDefault();
			smoothScrollViewportTop();
		}
	}

	return (
		<div
			data-app-shell
			className="flex h-screen flex-col overflow-hidden bg-background text-foreground"
		>
			<header className="z-40 shrink-0 border-b border-border bg-background">
				<div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-6">
					<Link
						to="/"
						onClick={handleHomeLogoClick}
						className="flex items-center gap-3 rounded-md text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<ThinkExLogo size={28} />
						<span className="text-xl font-semibold tracking-tight sm:text-2xl">ThinkEx</span>
					</Link>

					<nav className="flex flex-1 items-center justify-end gap-3" aria-label="Site">
						<ModeToggle className="size-9" />
						<Button
							nativeButton={false}
							render={<Link to="/login" />}
							variant="outline"
							size="default"
						>
							Sign in
						</Button>
						<Button nativeButton={false} render={<Link to="/login" />} size="default">
							Get started
						</Button>
					</nav>
				</div>
			</header>

			<div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
				<main>
					<section className="border-b border-border">
						<div className="mx-auto w-full max-w-7xl px-6 py-16 lg:py-20">
							<div className="max-w-3xl">
								<h1 className="text-5xl font-medium tracking-tight text-balance sm:text-6xl lg:text-7xl">
									The workspace built for how you{" "}
									<CyclingWord words={["think", "study", "research", "create"]} />
								</h1>
								<p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
									ThinkEx lets you organize and work across documents, media, and AI in one place.
								</p>
							</div>

							<div className="mt-16 overflow-hidden rounded-md border border-border bg-card shadow-2xl">
								<img
									src="/landing-workspace-screenshot.webp"
									alt="ThinkEx workspace with documents, folders, and AI assistant"
									className="block h-auto w-full"
									width={2936}
									height={1664}
									loading="eager"
									decoding="async"
									fetchPriority="high"
								/>
							</div>
						</div>
					</section>
				</main>

				<SiteFooter />
			</div>
		</div>
	);
}
