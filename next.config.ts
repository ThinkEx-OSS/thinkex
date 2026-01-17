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
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
