import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";

import { ModeToggle } from "#/components/mode-toggle";
import SiteFooter from "#/components/SiteFooter";
import ThinkExLogo from "#/components/ThinkExLogo";
import { Button } from "#/components/ui/button";
import { CyclingWord } from "#/components/ui/cycling-word";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "#/components/ui/sheet";
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
			className="flex h-screen flex-col overflow-hidden bg-background text-foreground dark:bg-black"
		>
			<header className="z-40 shrink-0 border-b border-border bg-background dark:bg-black">
				<div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-6">
					<Link
						to="/"
						onClick={handleHomeLogoClick}
						className="flex items-center gap-3 rounded-md text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<ThinkExLogo size={28} />
						<span className="text-xl font-semibold tracking-tight sm:text-2xl">ThinkEx</span>
					</Link>

					<nav className="hidden flex-1 items-center justify-end gap-3 sm:flex" aria-label="Site">
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
					<div className="ml-auto sm:hidden">
						<Sheet>
							<SheetTrigger
								render={<Button variant="outline" size="icon" aria-label="Open site menu" />}
							>
								<Menu className="size-4" />
							</SheetTrigger>
							<SheetContent
								side="top"
								aria-label="Site menu"
								overlayClassName="transition-none! duration-0! data-ending-style:opacity-100! data-starting-style:opacity-100!"
								className="min-h-[17rem] gap-0 bg-background px-4 pt-16 pb-5 transition-none! duration-0! data-ending-style:translate-y-0! data-ending-style:opacity-100! data-starting-style:translate-y-0! data-starting-style:opacity-100! dark:bg-black"
							>
								<Link
									to="/"
									onClick={handleHomeLogoClick}
									className="absolute top-0 left-6 flex h-14 items-center gap-3 rounded-md text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<ThinkExLogo size={28} />
									<span className="text-xl font-semibold tracking-tight">ThinkEx</span>
								</Link>
								<div className="mx-auto grid w-full max-w-sm gap-3">
									<Button
										nativeButton={false}
										render={<Link to="/login" />}
										variant="outline"
										size="lg"
										className="h-12"
									>
										Sign in
									</Button>
									<Button
										nativeButton={false}
										render={<Link to="/login" />}
										size="lg"
										className="h-12"
									>
										Get started
									</Button>
								</div>
							</SheetContent>
						</Sheet>
					</div>
				</div>
			</header>

			<div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
				<main>
					<section className="border-b border-border">
						<div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
							<div className="max-w-3xl">
								<h1 className="text-4xl font-medium tracking-tight text-balance sm:text-6xl lg:text-7xl">
									The workspace built for how you{" "}
									<CyclingWord words={["think", "study", "research", "create"]} />
								</h1>
								<p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:mt-6 sm:text-lg">
									ThinkEx lets you organize and work across documents, media, and AI in one place.
								</p>
								<div className="flex justify-center sm:hidden">
									<Button
										nativeButton={false}
										render={<Link to="/login" />}
										size="lg"
										className="mt-7 h-12 min-w-52 px-6 text-base"
									>
										Get started
									</Button>
								</div>
							</div>

							<Dialog>
								<DialogTrigger
									className="mt-10 block w-full cursor-zoom-in overflow-hidden rounded-md border border-border bg-card text-left shadow-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:mt-16 sm:shadow-2xl"
									aria-label="Open enlarged ThinkEx workspace preview"
								>
									<span className="relative block">
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
									</span>
								</DialogTrigger>
								<DialogContent
									showCloseButton={false}
									className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-1rem)] gap-0 overflow-auto bg-transparent p-0 ring-0 sm:max-w-6xl"
								>
									<DialogTitle className="sr-only">ThinkEx workspace preview</DialogTitle>
									<DialogDescription className="sr-only">
										Enlarged ThinkEx workspace screenshot.
									</DialogDescription>
									<img
										src="/landing-workspace-screenshot.webp"
										alt="ThinkEx workspace with documents, folders, and AI assistant"
										className="block h-auto w-full min-w-[720px] rounded-md"
										width={2936}
										height={1664}
										decoding="async"
									/>
								</DialogContent>
							</Dialog>
						</div>
					</section>
				</main>

				<SiteFooter />
			</div>
		</div>
	);
}
