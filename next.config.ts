import type { NextConfig } from "next";
import { withPostHogConfig } from "@posthog/nextjs-config";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  serverExternalPackages: [
    "postgres",
    "drizzle-orm",
  ],
  skipTrailingSlashRedirect: true,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

const sourceMapsEnabled =
  process.env.NODE_ENV === "production" &&
  Boolean(process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID);

export default withPostHogConfig(withWorkflow(nextConfig), {
  personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY ?? "",
  projectId: process.env.POSTHOG_PROJECT_ID ?? "",
  logLevel: sourceMapsEnabled ? "info" : "silent",
  sourcemaps: {
    enabled: sourceMapsEnabled,
    releaseName: process.env.POSTHOG_RELEASE_NAME ?? "thinkex",
    ...(process.env.POSTHOG_RELEASE_VERSION
      ? { releaseVersion: process.env.POSTHOG_RELEASE_VERSION }
      : {}),
    deleteAfterUpload: true,
  },
});
