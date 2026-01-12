"use client";

import { Helmet } from "react-helmet-async";
import { seoConfig, getPageTitle, getFullImageUrl } from "@/lib/seo-config";

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
  siteName?: string;
  author?: string;
  noindex?: boolean;
  nofollow?: boolean;
  canonical?: string;
  ogType?: string;
  twitterCard?: "summary" | "summary_large_image" | "app" | "player";
  twitterSite?: string;
  twitterCreator?: string;
}

export function SEO({
  title = seoConfig.defaultTitle,
  description = seoConfig.defaultDescription,
  keywords = seoConfig.defaultKeywords,
  image = seoConfig.defaultImage,
  url = seoConfig.siteUrl,
  type = "website",
  siteName = seoConfig.siteName,
  author = seoConfig.author,
  noindex = false,
  nofollow = false,
  canonical,
  ogType = "website",
  twitterCard = "summary_large_image",
  twitterSite,
  twitterCreator,
}: SEOProps) {
  const fullTitle = getPageTitle(title);
  const canonicalUrl = canonical || url;
  const fullImageUrl = getFullImageUrl(image);

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="author" content={author} />
      <meta name="robots" content={`${noindex ? "noindex" : "index"}, ${nofollow ? "nofollow" : "follow"}`} />
      <meta name="language" content="English" />
      <meta name="revisit-after" content="7 days" />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImageUrl} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={title} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content="en_US" />

      {/* Twitter */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImageUrl} />
      <meta name="twitter:image:alt" content={title} />
      {twitterSite && <meta name="twitter:site" content={twitterSite} />}
      {twitterCreator && <meta name="twitter:creator" content={twitterCreator} />}

      {/* Additional Meta Tags */}
      <meta name="theme-color" content={seoConfig.themeColor} />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="ThinkEx" />
      <meta name="application-name" content="ThinkEx" />
      <meta name="msapplication-TileColor" content={seoConfig.themeColor} />
      <meta name="msapplication-config" content="/browserconfig.xml" />

      {/* Structured Data / JSON-LD */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: siteName,
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
        })}
      </script>

      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: siteName,
          url: url,
          logo: fullImageUrl,
          sameAs: [
            // Add your social media links here
            // "https://twitter.com/thinkex",
            // "https://linkedin.com/company/thinkex",
          ],
        })}
      </script>
    </Helmet>
  );
}

