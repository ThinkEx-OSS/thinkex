import type { Metadata } from "next";
import { getFullImageUrl, getPageTitle, seoConfig } from "@/lib/seo-config";

export const legalEffectiveDate = "April 15, 2026";

type LegalMetadataInput = {
  title: string;
  description: string;
  path: "/terms" | "/privacy" | "/cookies";
  keywords: string[];
};

export function buildLegalMetadata({
  title,
  description,
  path,
  keywords,
}: LegalMetadataInput): Metadata {
  const pageTitle = getPageTitle(title);
  const canonical = `${seoConfig.siteUrl}${path}`;
  const imageUrl = getFullImageUrl();

  return {
    title: pageTitle,
    description,
    keywords,
    alternates: {
      canonical,
    },
    openGraph: {
      title: pageTitle,
      description,
      url: canonical,
      siteName: seoConfig.siteName,
      type: "article",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: [imageUrl],
    },
  };
}
