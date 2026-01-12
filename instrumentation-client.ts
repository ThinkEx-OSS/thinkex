import posthog from 'posthog-js'

// Only initialize PostHog in production (not on localhost)
if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost')) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only',
    defaults: '2025-05-24', // Automatically handles pageview and pageleave events
  });
}
