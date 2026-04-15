import type { Metadata } from "next";
import { buildLegalMetadata, legalEffectiveDate } from "../legal-metadata";

export const metadata: Metadata = buildLegalMetadata({
  title: "Terms of Service",
  description:
    "Terms of Service for ThinkEx covering eligibility, accounts, acceptable use, AI features, collaboration, and legal responsibilities.",
  path: "/terms",
  keywords: [
    "ThinkEx terms of service",
    "ThinkEx legal terms",
    "AI workspace terms",
    "ThinkEx acceptable use policy",
  ],
});

export default function TermsPage() {
  return (
    <>
      <header className="mb-10">
        <h1>Terms of Service</h1>
        <p className="text-sm text-muted-foreground">
          Effective date: {legalEffectiveDate}
          <br />
          These Terms of Service govern your use of ThinkEx, a service operated
          by ThinkEx Inc., a Delaware corporation, at{" "}
          <a href="https://thinkex.app">https://thinkex.app</a>.
        </p>
      </header>

      <section>
        <h2>1. Acceptance of these terms</h2>
        <p>
          By accessing or using ThinkEx, you agree to be bound by these Terms of
          Service and our Privacy Policy. If you do not agree, do not use the
          service.
        </p>
      </section>

      <section>
        <h2>2. Eligibility</h2>
        <p>
          You must be at least 13 years old to use ThinkEx. If you are under the
          age of majority where you live, you may use the service only with the
          involvement and consent of a parent or legal guardian. You may not use
          ThinkEx if doing so would violate applicable law.
        </p>
      </section>

      <section>
        <h2>3. Accounts and access</h2>
        <p>
          ThinkEx currently supports sign-in with Google OAuth. We may also
          provide anonymous or temporary accounts that let you try features
          before linking or upgrading to a Google account.
        </p>
        <ul>
          <li>
            You are responsible for the activity that occurs under your account
            or session.
          </li>
          <li>
            If you use an anonymous account and later link it to a Google
            account, ThinkEx may migrate workspace data and associated history
            into the linked account.
          </li>
          <li>
            You must provide accurate account information and keep it current.
          </li>
          <li>
            You may not share access credentials or use another person&apos;s
            account without authorization.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Acceptable use</h2>
        <p>You may use ThinkEx only for lawful purposes.</p>
        <p>You may not:</p>
        <ul>
          <li>upload, store, generate, or share illegal content;</li>
          <li>
            use the service to harass, threaten, defame, impersonate, or abuse
            other people;
          </li>
          <li>
            misuse AI features to create fraudulent, deceptive, malicious, or
            harmful output;
          </li>
          <li>
            reverse engineer, probe, overload, disrupt, or interfere with the
            service or its security features;
          </li>
          <li>
            scrape, crawl, mirror, or systematically extract data or output from
            ThinkEx except where we expressly permit it;
          </li>
          <li>
            use ThinkEx in a way that infringes intellectual property,
            publicity, privacy, or other legal rights.
          </li>
        </ul>
        <p>
          We may investigate misuse and take action, including removing content,
          limiting features, suspending sessions, or terminating accounts.
        </p>
      </section>

      <section>
        <h2>5. Your content and licenses</h2>
        <p>
          You retain ownership of the content you upload, create, or store in
          ThinkEx, including notes, cards, flashcards, files, prompts, chat
          messages, and workspace materials.
        </p>
        <p>
          To operate the service, you grant ThinkEx a worldwide, non-exclusive,
          revocable license to host, store, reproduce, process, transmit,
          display, and adapt your content solely as needed to provide, secure,
          maintain, and improve ThinkEx. This includes generating AI outputs,
          indexing content for retrieval, syncing collaboration data, creating
          backups, and fulfilling export requests you initiate.
        </p>
        <p>
          You represent that you have the rights needed to submit your content
          and to grant this license.
        </p>
      </section>

      <section>
        <h2>6. AI features and output disclaimer</h2>
        <p>
          ThinkEx includes AI-powered features. AI output may be incomplete,
          inaccurate, biased, offensive, outdated, or unsuitable for your use
          case. ThinkEx does not guarantee the correctness or reliability of AI
          output.
        </p>
        <p>
          You are responsible for reviewing and verifying AI-generated content
          before relying on it, especially for educational, professional,
          financial, legal, medical, safety-critical, or other high-impact uses.
        </p>
      </section>

      <section>
        <h2>7. Third-party services</h2>
        <p>
          ThinkEx depends on third-party providers, including Google, Supabase,
          hosting providers, email providers, and AI providers such as Google,
          Anthropic, and OpenAI. Your use of ThinkEx may therefore involve
          third-party services outside our direct control.
        </p>
        <p>
          ThinkEx is not responsible for outages, interruptions, policy changes,
          API limitations, security incidents, or other issues caused by
          third-party services.
        </p>
      </section>

      <section>
        <h2>8. Workspace sharing and collaboration</h2>
        <p>
          ThinkEx may allow you to invite collaborators, create share links, or
          otherwise share workspace content with other people. You are
          responsible for deciding what you share and with whom.
        </p>
        <ul>
          <li>
            Shared collaborators may be able to view, copy, edit, export, or
            further distribute material you make available to them.
          </li>
          <li>
            You remain responsible for the legality and appropriateness of the
            content you share.
          </li>
          <li>
            If you collaborate in a workspace, you are responsible for your own
            actions and contributions in that workspace.
          </li>
        </ul>
      </section>

      <section>
        <h2>9. Open source code and self-hosted deployments</h2>
        <p>
          The ThinkEx codebase is available under the GNU Affero General Public
          License v3.0 (AGPL-3.0). That license governs use, modification, and
          redistribution of the open source code.
        </p>
        <p>
          These Terms apply to the hosted ThinkEx service at
          https://thinkex.app. Self-hosted or independently deployed instances
          are separate services operated by their respective administrators and
          are not covered by our hosted-service obligations except as required
          by applicable law.
        </p>
      </section>

      <section>
        <h2>10. Availability, changes, and beta functionality</h2>
        <p>
          ThinkEx is provided on an &quot;as is&quot; and &quot;as
          available&quot; basis. We do not guarantee uninterrupted availability,
          specific uptime, error-free operation, preservation of any feature, or
          that any content will always remain accessible.
        </p>
        <p>
          We may add, modify, suspend, or remove features at any time. Some
          features may be experimental or beta and may change materially or be
          discontinued without notice.
        </p>
      </section>

      <section>
        <h2>11. Termination and account deletion</h2>
        <p>
          You may stop using ThinkEx at any time. You may also request account
          deletion through the product features we provide. When your account is
          deleted, ThinkEx will delete your user record and associated data
          according to our systems and retention practices, including cascading
          deletion of linked workspaces where supported.
        </p>
        <p>
          We may suspend or terminate your access immediately if we reasonably
          believe you violated these Terms, created risk for other users or
          ThinkEx, or if we are required to do so by law.
        </p>
      </section>

      <section>
        <h2>12. Disclaimer of warranties</h2>
        <p>
          To the fullest extent permitted by law, ThinkEx disclaims all
          warranties, whether express, implied, statutory, or otherwise,
          including implied warranties of merchantability, fitness for a
          particular purpose, non-infringement, and quiet enjoyment.
        </p>
      </section>

      <section>
        <h2>13. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, ThinkEx Inc. and its officers,
          directors, employees, contractors, and affiliates will not be liable
          for any indirect, incidental, special, consequential, exemplary, or
          punitive damages, or for any loss of profits, revenues, goodwill, use,
          data, or other intangible losses arising from or related to your use
          of ThinkEx.
        </p>
        <p>
          To the fullest extent permitted by law, our total liability for any
          claim arising out of or relating to ThinkEx will not exceed the
          greater of one hundred U.S. dollars (US$100) or the amount you paid to
          ThinkEx for the service in the twelve months before the claim arose.
        </p>
      </section>

      <section>
        <h2>14. Governing law</h2>
        <p>
          These Terms are governed by the laws of the State of Delaware, USA,
          without regard to conflict-of-law principles.
        </p>
      </section>

      <section>
        <h2>15. Contact</h2>
        <p>
          Questions about these Terms can be sent to{" "}
          <a href="mailto:hello@thinkex.app">hello@thinkex.app</a>.
        </p>
      </section>
    </>
  );
}
