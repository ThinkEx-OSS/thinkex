export const seo = {
	siteName: "ThinkEx",
	defaultTitle: "ThinkEx",
	defaultDescription:
		"Interact with sources, control AI context, and synthesize information in a workspace built for how you actually think.",
	openGraphImagePath: "/opengraph.png",
} as const;

type PublicMetaOptions = {
	title?: string;
	description?: string;
	openGraphType?: "website" | "article";
	openGraphImageAlt?: string;
};

export function getPageTitle(title?: string) {
	if (!title || title === seo.defaultTitle) {
		return seo.defaultTitle;
	}

	return `${seo.defaultTitle} | ${title}`;
}

export function buildPublicMeta({
	title,
	description = seo.defaultDescription,
	openGraphType = "website",
	openGraphImageAlt = seo.siteName,
}: PublicMetaOptions = {}) {
	const pageTitle = getPageTitle(title);

	return [
		{
			title: pageTitle,
		},
		{
			name: "description",
			content: description,
		},
		{
			property: "og:title",
			content: pageTitle,
		},
		{
			property: "og:description",
			content: description,
		},
		{
			property: "og:image",
			content: seo.openGraphImagePath,
		},
		{
			property: "og:image:width",
			content: "1200",
		},
		{
			property: "og:image:height",
			content: "630",
		},
		{
			property: "og:image:alt",
			content: openGraphImageAlt,
		},
		{
			property: "og:type",
			content: openGraphType,
		},
		{
			property: "og:site_name",
			content: seo.siteName,
		},
		{
			name: "twitter:card",
			content: "summary_large_image",
		},
		{
			name: "twitter:title",
			content: pageTitle,
		},
		{
			name: "twitter:description",
			content: description,
		},
		{
			name: "twitter:image",
			content: seo.openGraphImagePath,
		},
	];
}
