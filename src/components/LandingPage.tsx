import { Link } from "@tanstack/react-router";

import { PublicHeader } from "#/components/PublicHeader";
import SiteFooter from "#/components/SiteFooter";
import { Button } from "#/components/ui/button";
import { BottomCtaSection } from "#/components/landing/BottomCtaSection";
import { BrandWord } from "#/components/landing/BrandWord";
import { BrowserChromeBar } from "#/components/landing/BrowserChromeBar";
import { ComparisonSection } from "#/components/landing/ComparisonSection";
import { FeatureGridSection } from "#/components/landing/FeatureGridSection";
import { GroundedSection } from "#/components/landing/GroundedSection";
import { ItemTypesSection } from "#/components/landing/ItemTypesSection";
import { LatestBlogSection } from "#/components/landing/LatestBlogSection";
import { PricingSection } from "#/components/landing/PricingSection";
import { WorkspaceShowcaseSection } from "#/components/landing/WorkspaceShowcaseSection";
import { useLandingSectionScroll } from "#/components/landing/useLandingSectionScroll";

interface LandingPageProps {
	signedIn?: boolean;
}

/** The public marketing page, also served at /welcome for signed-in visitors. */
export default function LandingPage({ signedIn = false }: LandingPageProps) {
	const scrollRootRef = useLandingSectionScroll();

	return (
		<div
			data-app-shell
			className="flex h-screen flex-col overflow-hidden bg-background text-foreground dark:bg-black"
		>
			<PublicHeader signedIn={signedIn} />

			{/* `relative` keeps absolutely positioned descendants (e.g. `sr-only` labels) inside this
			    scroll container: without it they resolve against the initial containing block, escape
			    the overflow clip, and make the document itself scrollable behind the fixed app shell. */}
			<div
				ref={scrollRootRef}
				data-scroll-root // overflow-x-clip, not hidden: the full-bleed sections below use w-screen,
				// which exceeds this container's content width wherever scrollbars take
				// space. clip suppresses that without creating a scroll container.
				className="relative min-h-0 flex-1 overflow-x-clip overflow-y-auto"
			>
				<main>
					<section>
						<div className="mx-auto w-full max-w-7xl px-4 pt-12 pb-0 sm:px-6 sm:pt-16 lg:pt-20">
							<div className="max-w-5xl">
								<h1 className="text-4xl font-medium tracking-tight text-balance sm:text-6xl lg:text-7xl">
									Study and research, grounded in <BrandWord word="your" /> sources.
								</h1>
								<p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:mt-6 sm:text-lg lg:text-xl lg:leading-8">
									The workspace for easily working across docs, media, and AI.
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

							<div className="mt-10 overflow-hidden rounded-md border border-border bg-background sm:mt-16 dark:bg-black">
								<BrowserChromeBar />
								{/* The full-size file is 2936px for a slot that is at most 1232 CSS px
								    wide, so a phone was downloading and decoding roughly 150KB it could
								    not use. sizes matches the max-w-7xl container minus its padding. */}
								<img
									src="/landing-hero-2936.webp"
									srcSet="/landing-hero-800.webp 800w, /landing-hero-1200.webp 1200w, /landing-hero-1800.webp 1800w, /landing-hero-2936.webp 2936w"
									sizes="(min-width: 1280px) 1232px, calc(100vw - 2rem)"
									alt="ThinkEx workspace with documents, folders, and AI assistant"
									className="block h-auto w-full"
									width={2936}
									height={1642}
									loading="eager"
									decoding="async"
									fetchPriority="high"
								/>
							</div>

							<WorkspaceShowcaseSection />
							<GroundedSection />
							<ItemTypesSection />
							<FeatureGridSection />
							<ComparisonSection />
							<PricingSection />
							<LatestBlogSection />
							<BottomCtaSection />
						</div>
					</section>
				</main>

				<SiteFooter />
			</div>
		</div>
	);
}
