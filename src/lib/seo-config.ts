/**
 * SEO Configuration
 * Centralized SEO defaults and configuration for the ThinkEx application
 */

export const seoConfig = {
  defaultTitle: "ThinkEx",
  defaultDescription:
    "Interact with sources, control AI context, and synthesize information in a workspace built for how you actually think.",
  defaultKeywords:
    "AI workspace, productivity, collaboration, artificial intelligence, workspace tools, ThinkEx, AI assistant, creative workspace",
  siteUrl: "https://thinkex.app",
  siteName: "ThinkEx",
  author: "ThinkEx",
  defaultImage: "/opengraph.png",
} as const;

export const getPageTitle = (title?: string): string => {
  if (!title) return seoConfig.defaultTitle;
  if (title.includes("ThinkEx")) return title;
  return `${title} | ThinkEx`;
};

export const getFullImageUrl = (image?: string): string => {
  const imagePath = image || seoConfig.defaultImage;
  if (imagePath.startsWith("http")) return imagePath;
  return `${seoConfig.siteUrl}${imagePath}`;
};
