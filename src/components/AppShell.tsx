import { Link } from "@tanstack/react-router";

import ThinkExLogo from "#/components/ThinkExLogo";
import UserProfileDropdown from "#/components/UserProfileDropdown";

interface AppShellProps {
	title?: string;
	subtitle?: string;
	headerContext?: React.ReactNode;
	navbarControls?: React.ReactNode;
	siteControls?: React.ReactNode;
	children: React.ReactNode;
}

export default function AppShell({
	title,
	subtitle,
	headerContext,
	navbarControls,
	siteControls,
	children,
}: AppShellProps) {
	return (
		<div
			data-app-shell
			className="flex h-screen flex-col overflow-hidden bg-background text-foreground"
		>
			<header className="z-40 shrink-0 bg-muted">
				<div className="flex h-12 w-full items-center gap-3 px-4">
					<div className="flex min-w-0 shrink-0 items-center gap-3 text-foreground">
						<Link
							to="/home"
							className="flex shrink-0 items-center gap-3 rounded-md text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<ThinkExLogo size={28} />
							<span className="text-xl font-semibold tracking-tight sm:text-2xl">ThinkEx</span>
						</Link>
						{headerContext ? (
							<>
								<div aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
								<div className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
									{headerContext}
								</div>
							</>
						) : null}
					</div>

					<div className="flex min-w-0 flex-1 items-center justify-center gap-2">
						{navbarControls}
					</div>

					<nav className="flex shrink-0 items-center justify-end gap-1" aria-label="Site">
						{siteControls}
						<UserProfileDropdown />
					</nav>
				</div>
			</header>

			<div data-scroll-root className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
				<main className="flex-1 min-h-0 p-4">
					{title || subtitle ? (
						<section className="space-y-2">
							{title ? (
								<h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
									{title}
								</h1>
							) : null}
							{subtitle ? (
								<p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
									{subtitle}
								</p>
							) : null}
						</section>
					) : null}

					<div className={title || subtitle ? "mt-8" : undefined}>{children}</div>
				</main>
			</div>
		</div>
	);
}
