import { Link } from "@tanstack/react-router";
import type { MouseEvent } from "react";

import {
	getLandingSectionId,
	landingSectionScrollOptions,
	scrollLandingSectionIntoView,
	type LandingSectionId,
} from "#/components/landing/landing-sections";
import { useMarketingHomePath } from "#/components/use-marketing-home-path";
import { isPlainLeftClick } from "#/lib/plain-link-click";

type PublicSectionLinkProps = {
	children: React.ReactNode;
	className?: string;
	sectionId: LandingSectionId;
};

export function PublicSectionLink({ children, className, sectionId }: PublicSectionLinkProps) {
	// The sections live on the landing page, which is served at two paths. Point
	// at whichever one the visitor can actually reach — `/` bounces a signed-in
	// visitor to `/home`, so for them these would otherwise leave the site.
	const marketingHome = useMarketingHomePath();

	function handleClick(event: MouseEvent<HTMLAnchorElement>) {
		if (
			!isPlainLeftClick(event) ||
			window.location.pathname !== marketingHome ||
			getLandingSectionId(window.location.hash) !== sectionId
		) {
			return;
		}

		event.preventDefault();
		scrollLandingSectionIntoView(sectionId);
	}

	return (
		<Link
			to={marketingHome}
			hash={sectionId}
			hashScrollIntoView={landingSectionScrollOptions}
			className={className}
			onClick={handleClick}
		>
			{children}
		</Link>
	);
}
