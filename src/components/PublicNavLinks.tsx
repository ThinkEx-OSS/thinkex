import { Link } from "@tanstack/react-router";

type PublicNavLinksProps = {
	className?: string;
	linkClassName?: string;
};

const linkClassName =
	"text-sm font-normal text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline";

const navLinks = [
	{ label: "Features" },
	{ label: "Pricing" },
	{ label: "Blog", to: "/blog" },
	{ label: "Careers" },
] as const;

export function PublicNavLinks({
	className,
	linkClassName: extraLinkClassName,
}: PublicNavLinksProps) {
	const classes = extraLinkClassName ? `${linkClassName} ${extraLinkClassName}` : linkClassName;

	return (
		<div className={className}>
			{navLinks.map((link) =>
				"to" in link ? (
					<Link key={link.label} to={link.to} className={classes}>
						{link.label}
					</Link>
				) : (
					<button key={link.label} type="button" aria-disabled="true" className={classes}>
						{link.label}
					</button>
				),
			)}
		</div>
	);
}
