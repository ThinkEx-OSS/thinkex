import type { Metadata } from "next";
import Script from "next/script";

// Using system fonts instead of custom fonts
import { Providers } from "@/components/providers";
import { QueryProvider } from "@/components/query-provider";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import AppProviders from "@/components/providers/AppProviders";
import "./globals.css";

const isDev = process.env.NODE_ENV === "development";

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
    icon: {
      url: isDev ? "/favicon-dev.svg" : "/thinkexdarkfav.svg",
      type: "image/svg+xml",
    },
    apple: "/apple-touch-icon.png",
  },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "ThinkEx",
  url: "https://thinkex.app",
  description:
    "Interact with sources, control AI context, and synthesize information in a workspace built for how you actually think.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {isDev && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
      </head>
      <body className="subpixel-antialiased bg-background text-foreground">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteJsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <AppProviders>
          <PostHogProvider>
            <QueryProvider>
              <Providers>
                <Script
                  src="https://accounts.google.com/gsi/client"
                  strategy="afterInteractive"
                />
                {children}
              </Providers>
            </QueryProvider>
          </PostHogProvider>
        </AppProviders>
      </body>
    </html>
  );
}
