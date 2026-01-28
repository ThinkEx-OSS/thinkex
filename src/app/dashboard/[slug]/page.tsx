"use client";

/**
 * Legacy route: /dashboard/[slug]
 * Redirects to /workspace/[slug] for backwards compatibility
 */
import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";

export default function DashboardSlugPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params?.slug as string;

  useEffect(() => {
    if (slug) {
      router.replace(`/workspace/${slug}`);
    }
  }, [router, slug]);

  return null;
}

