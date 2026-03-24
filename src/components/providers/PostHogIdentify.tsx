"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { onPostHogReady } from "@/lib/posthog-client";

export function PostHogIdentify() {
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (isPending) {
      return;
    }

    return onPostHogReady((client) => {
      if (session?.user) {
        const user = session.user;
        const currentDistinctId = client.get_distinct_id();

        if (currentDistinctId && currentDistinctId !== user.id) {
          client.alias(user.id, currentDistinctId);
        }

        client.identify(user.id, {
          email: user.email,
          name: user.name,
          image: user.image,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
        });
        return;
      }

      client.reset();
    });
  }, [session, isPending]);

  return null;
}
