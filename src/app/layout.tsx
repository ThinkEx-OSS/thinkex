import type { Metadata } from "next";

// Using system fonts instead of custom fonts
import { Providers } from "@/components/providers";
import { QueryProvider } from "@/components/query-provider";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import { HelmetProviderWrapper } from "@/components/providers/HelmetProviderWrapper";
import LazyAppProviders from "@/components/providers/LazyAppProviders";
import "./globals.css";
import "katex/dist/katex.min.css";
import { SpeedInsights } from "@vercel/speed-insights/next"

export const metadata: Metadata = {
  metadataBase: new URL("https://thinkex.app"),
  title: "ThinkEx",
  description:
    "Interact with sources, control AI context, and synthesize information in a workspace built for how you actually think.",
  openGraph: {
    title: "ThinkEx",
    description:
      "Interact with sources, control AI context, and synthesize information in a workspace built for how you actually think.",
    url: "https://thinkex.app",
    siteName: "ThinkEx",
    images: [
      {
        url: "/opengraph.png",
        width: 1200,
        height: 630,
        alt: "ThinkEx",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ThinkEx",
    description:
      "Interact with sources, control AI context, and synthesize information in a workspace built for how you actually think.",
    images: ["/opengraph.png"],
  },
  icons: {
    icon: [
      { url: "/newfav.ico", sizes: "32x32" },
      { url: "/thinkexdarkfav.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="subpixel-antialiased bg-background text-foreground">
        <LazyAppProviders>
          <HelmetProviderWrapper>
            <PostHogProvider>
              <QueryProvider>
                <Providers>
                  {children}
                  <SpeedInsights />
                </Providers>
              </QueryProvider>
            </PostHogProvider>
          </HelmetProviderWrapper>
        </LazyAppProviders>
      </body>
    </html>
  );
}
