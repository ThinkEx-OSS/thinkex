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

  // Security headers configuration
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://js.stripe.com https://*.google.com https://*.googleapis.com https://*.gstatic.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https: http:",
              "font-src 'self' https://fonts.gstatic.com data:",
              "connect-src 'self' https://*.thinkex.app https://*.vercel.app https://*.googleapis.com https://*.google.com wss://*.assistant-ui.com https://*.assistant-ui.com https://api.firecrawl.dev https://*.supabase.co",
              "frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com https://www.youtube.com https://youtube.com https://*.google.com",
              "worker-src 'self' blob:",
              "media-src 'self' blob: https:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
