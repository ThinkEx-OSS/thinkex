import type { Metadata } from "next";
import { buildLegalMetadata, legalEffectiveDate } from "../legal-metadata";

export const metadata: Metadata = buildLegalMetadata({
  title: "Cookie Policy",
  description:
    "Cookie Policy for ThinkEx describing essential authentication cookies, analytics cookies, and how to manage cookie preferences.",
  path: "/cookies",
  keywords: [
    "ThinkEx cookie policy",
    "ThinkEx cookies",
    "ThinkEx analytics cookies",
    "ThinkEx authentication cookies",
  ],
});

export default function CookiesPage() {
  return (
    <>
      <header className="mb-10">
        <h1>Cookie Policy</h1>
        <p className="text-sm text-muted-foreground">
          Effective date: {legalEffectiveDate}
          <br />
          This Cookie Policy explains how ThinkEx Inc. uses cookies and similar
          storage technologies on{" "}
          <a href="https://thinkex.app">https://thinkex.app</a>.
        </p>
      </header>

      <section>
        <h2>1. What cookies are</h2>
        <p>
          Cookies are small text files stored on your device by your browser.
          ThinkEx also uses similar storage mechanisms such as local storage for
          analytics and application behavior. This policy focuses on the cookie
          and session technologies used to operate and measure the service.
        </p>
      </section>

      <section>
        <h2>2. Essential cookies</h2>
        <p>
          These cookies are required for authentication and core product
          operation.
        </p>
        <ul>
          <li>
            <strong>better-auth.session_token</strong> — authentication session
            cookie used to keep you signed in. It is configured as HttpOnly,
            Secure in production, and SameSite=lax, and it has a 30-day expiry.
            This cookie is required for login functionality.
          </li>
          <li>
            <strong>better-auth.cookie_cache</strong> — a short-lived cookie
            cache used for authentication performance optimization. The cache
            has a five-minute TTL.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Analytics cookies</h2>
        <p>
          ThinkEx uses PostHog analytics cookies with the <code>ph_*</code>
          prefix. These cookies and related local storage entries help us
          understand product usage, analyze feature adoption, support session
          replay where enabled, and evaluate feature flags. They help us improve
          the product experience and monitor product behavior over time.
        </p>
      </section>

      <section>
        <h2>4. Third-party cookies</h2>
        <p>
          If you choose Google sign-in, Google Identity Services may set cookies
          needed to complete OAuth authentication and account selection flows.
        </p>
        <p>
          ThinkEx does not use advertising or marketing cookies on the hosted
          service.
        </p>
      </section>

      <section>
        <h2>5. Managing cookies</h2>
        <p>
          Most browsers let you view, manage, block, or delete cookies through
          browser settings. You can usually clear site data, block third-party
          cookies, or configure prompts before cookies are stored.
        </p>
        <p>
          If you delete or block essential authentication cookies, you may be
          signed out and required to authenticate again before using ThinkEx.
        </p>
      </section>

      <section>
        <h2>6. Contact</h2>
        <p>
          Questions about this Cookie Policy can be sent to{" "}
          <a href="mailto:hello@thinkex.app">hello@thinkex.app</a>.
        </p>
      </section>
    </>
  );
}
