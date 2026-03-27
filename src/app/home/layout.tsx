import type { Metadata } from "next";
import type { ReactNode } from "react";
import { seoConfig, getPageTitle, getFullImageUrl } from "@/lib/seo-config";

const pageDescription =
  "Choose a workspace or create a new one to start organizing your knowledge in ThinkEx.";
const pageUrl = "https://thinkex.app/home";
const pageTitle = getPageTitle("Home");
const ogImage = getFullImageUrl(seoConfig.defaultImage);

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  keywords: ["home", "workspaces", "dashboard", "productivity tools"],
  authors: [{ name: seoConfig.author }],
  robots: { index: true, follow: true },
  alternates: { canonical: pageUrl },
  openGraph: {
    type: "website",
    url: pageUrl,
    title: pageTitle,
    description: pageDescription,
    siteName: seoConfig.siteName,
    images: [{ url: ogImage, width: 1200, height: 630, alt: "Home" }],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
    images: [ogImage],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ThinkEx",
  },
  applicationName: "ThinkEx",
  themeColor: seoConfig.themeColor,
  other: {
    "msapplication-TileColor": seoConfig.themeColor,
    "msapplication-config": "/browserconfig.xml",
  },
};

const webAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: seoConfig.siteName,
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    ratingCount: "100",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: seoConfig.siteName,
  url: pageUrl,
  logo: ogImage,
  sameAs: [] as string[],
};

export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webAppJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      {children}
    </>
  );
}
