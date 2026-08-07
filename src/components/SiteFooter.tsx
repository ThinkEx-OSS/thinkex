import { Link } from "@tanstack/react-router";

import { CONTACT_EMAIL, communityLinks } from "#/components/community-links";
import { FEATURES_SECTION_ID, PRICING_SECTION_ID } from "#/components/landing/landing-sections";
import { PublicSectionLink } from "#/components/PublicSectionLink";
import ThinkExLogo from "#/components/ThinkExLogo";
import { useMarketingHomePath } from "#/components/use-marketing-home-path";
import { useCopyToClipboard } from "#/hooks/use-copy-to-clipboard";
import { isPostHogEnabled } from "#/integrations/posthog/config";
import { openConsentPreferences } from "#/integrations/posthog/consent";

const externalLinkClassName =
	"text-base text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline";

const footerColumns = [
	{
		title: "Product",
		links: [
			{ label: "Features", sectionId: FEATURES_SECTION_ID },
			{ label: "Pricing", sectionId: PRICING_SECTION_ID },
			{ label: "Workspace", to: "/login" },
		],
	},
	{
		title: "Resources",
		links: [
			{ label: "Blog", to: "/blog" },
			{ label: "Docs", href: "https://docs.thinkex.app" },
			{ label: "GitHub", href: "https://github.com/thinkex-oss/thinkex" },
		],
	},
	{
		title: "Company",
		links: [
			{ label: "Careers", href: `mailto:${CONTACT_EMAIL}?subject=Careers%20at%20ThinkEx` },
			{ label: "Email", action: "copyEmail" },
			{ label: "Community", href: "https://discord.gg/dtPnzkqCcG" },
		],
	},
	{
		title: "Legal",
		links: [
			{ label: "Terms of Service", to: "/terms" },
			{ label: "Privacy Policy", to: "/privacy" },
			{ label: "Cookie Policy", to: "/cookies" },
			{ label: "Cookie Preferences", action: "cookiePreferences" },
		],
	},
] as const;

export default function SiteFooter() {
	const { copied, copy } = useCopyToClipboard({ resetTimeoutMs: 2000 });
	const marketingHome = useMarketingHomePath();

	return (
		<footer className="bg-background text-foreground dark:bg-black">
			<div className="mx-auto w-full max-w-7xl px-6 py-14 sm:py-16">
				<div className="grid gap-10 lg:grid-cols-[minmax(12rem,1.1fr)_minmax(0,3fr)] lg:gap-16">
					<div>
						<Link
							to={marketingHome}
							aria-label="ThinkEx home"
							className="inline-flex rounded-md text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<ThinkExLogo size={32} />
						</Link>
					</div>

					<nav
						aria-label="Footer"
						className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:gap-x-12"
					>
						{footerColumns.map((column) => (
							<div key={column.title}>
								<h2 className="text-sm font-medium text-muted-foreground">{column.title}</h2>
								<ul className="mt-4 grid gap-3.5">
									{column.links
										.filter(
											(link) =>
												!(
													"action" in link &&
													link.action === "cookiePreferences" &&
													!isPostHogEnabled
												),
										)
										.map((link) => (
											<li key={link.label}>
												{"action" in link ? (
													link.action === "cookiePreferences" ? (
														<button
															type="button"
															onClick={() => openConsentPreferences()}
															className={`${externalLinkClassName} text-left`}
														>
															{link.label}
														</button>
													) : (
														<button
															type="button"
															onClick={() => void copy(CONTACT_EMAIL)}
															className={`${externalLinkClassName} text-left`}
															aria-label={copied ? "Email copied" : `Copy ${CONTACT_EMAIL}`}
														>
															{copied ? "Copied" : link.label}
														</button>
													)
												) : "href" in link ? (
													<a
														href={link.href}
														target={link.href.startsWith("http") ? "_blank" : undefined}
														rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
														className={externalLinkClassName}
													>
														{link.label}
													</a>
												) : (
													<FooterInternalLink link={link} />
												)}
											</li>
										))}
								</ul>
							</div>
						))}
					</nav>
				</div>

				<div className="mt-12 flex flex-col gap-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
					<p>© 2026 ThinkEx Inc. All rights reserved.</p>
					<div className="flex flex-wrap items-center gap-4">
						{communityLinks.map(({ href, icon: Icon, label }) => (
							<a
								key={href}
								href={href}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={label}
								className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							>
								<Icon className={label === "Twitter / X" ? "size-4" : "size-5"} />
							</a>
						))}
					</div>
				</div>
			</div>
		</footer>
	);
}

function FooterInternalLink({
	link,
}: {
	link: Extract<
		(typeof footerColumns)[number]["links"][number],
		{ sectionId: string } | { to: string }
	>;
}) {
	if ("sectionId" in link) {
		return (
			<PublicSectionLink sectionId={link.sectionId} className={externalLinkClassName}>
				{link.label}
			</PublicSectionLink>
		);
	}

	return (
		<Link to={link.to} className={externalLinkClassName}>
			{link.label}
		</Link>
	);
}
