import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  reactStrictMode: false, // BlockNote is not yet compatible with React 19 StrictMode
  // Transpile git-installed packages to ensure proper module resolution
  transpilePackages: ["react-grid-layout"],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Externalize server-only packages to avoid bundling issues
  // Note: @blocknote/core and @blocknote/react have CSS imports and can't be externalized
  serverExternalPackages: [
    "@blocknote/server-util",
  ],
  async rewrites() {
    return [
      {
        source: '/relay-xSpr/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/relay-xSpr/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
