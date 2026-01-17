import posthog from 'posthog-js'

// Only initialize PostHog in production (not on localhost)
if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost')) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: 'https://ph.thinkex.app',
    ui_host: 'https://us.posthog.com',
    person_profiles: 'identified_only',
    defaults: '2025-05-24', // Automatically handles pageview and pageleave events
  });
}
