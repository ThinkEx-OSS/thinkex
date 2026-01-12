"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import posthog from "posthog-js";

export function PostHogIdentify() {
  const { data: session, isPending } = useSession();

  useEffect(() => {
    // Only run on client side after PostHog is initialized
    if (typeof window === 'undefined' || !posthog.__loaded) return;

    if (!isPending && session?.user) {
      const user = session.user;

      // Get the current anonymous distinct_id before identifying
      const currentDistinctId = posthog.get_distinct_id();

      // If the user was previously anonymous (distinct_id differs from user.id),
      // alias the anonymous ID to the authenticated user ID to merge their history
      if (currentDistinctId && currentDistinctId !== user.id) {
        // alias(newId, previousAnonymousId) links the two identities in PostHog
        posthog.alias(user.id, currentDistinctId);
      }

      // Identify the user with PostHog (this sets the distinct_id to user.id)
      posthog.identify(user.id, {
        email: user.email,
        name: user.name,
        image: user.image,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      });
    } else if (!isPending && !session) {
      // Reset PostHog when user logs out
      posthog.reset();
    }
  }, [session, isPending]);

  return null;
}
