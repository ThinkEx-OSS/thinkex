import type { Metadata } from "next";
import { buildLegalMetadata, legalEffectiveDate } from "../legal-metadata";

export const metadata: Metadata = buildLegalMetadata({
  title: "Privacy Policy",
  description:
    "Privacy Policy for ThinkEx explaining what personal data we collect, how we use it, where it is shared, and the rights available to users.",
  path: "/privacy",
  keywords: [
    "ThinkEx privacy policy",
    "ThinkEx personal data",
    "AI workspace privacy",
    "ThinkEx GDPR CCPA",
  ],
});

export default function PrivacyPage() {
  return (
    <>
      <header className="mb-10">
        <h1>Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">
          Effective date: {legalEffectiveDate}
          <br />
          ThinkEx Inc., a Delaware corporation, operates ThinkEx at{" "}
          <a href="https://thinkex.app">https://thinkex.app</a>. This Privacy
          Policy explains what data we collect, how we use it, when we share it,
          and the choices available to you.
        </p>
      </header>

      <section>
        <h2>1. Scope</h2>
        <p>
          This Privacy Policy applies to the hosted ThinkEx service, including
          our web app, authentication flows, workspace collaboration features,
          AI features, uploads, analytics, and support-related communications.
        </p>
      </section>

      <section>
        <h2>2. Data we collect</h2>
        <h3>Account data</h3>
        <p>When you sign in with Google, we collect and store:</p>
        <ul>
          <li>your name;</li>
          <li>email address;</li>
          <li>profile image;</li>
          <li>email verification status;</li>
          <li>account creation and update timestamps;</li>
          <li>whether the account is anonymous or linked.</li>
        </ul>

        <h3>Authentication and session data</h3>
        <p>
          We store authentication-related records in PostgreSQL, including
          session tokens, expiration timestamps, user agent strings, and IP
          addresses collected from common proxy headers such as{" "}
          <code>x-forwarded-for</code>, <code>x-real-ip</code>, and{" "}
          <code>cf-connecting-ip</code>.
        </p>

        <h3>Workspace data</h3>
        <p>We store workspace information you create or submit, including:</p>
        <ul>
          <li>
            workspace names, descriptions, slugs, icons, colors, and metadata;
          </li>
          <li>notes, cards, flashcards, study materials, and other content;</li>
          <li>
            event logs recording workspace changes, versions, timestamps, and
            the <code>userId</code> associated with each change.
          </li>
        </ul>

        <h3>Files and uploads</h3>
        <p>
          We process and store files you upload, such as PDFs, images, videos,
          audio files, and office or document files. Files are stored in
          Supabase Storage.
        </p>

        <h3>Chat and AI data</h3>
        <p>
          We store chat threads and chat messages in our database. When you use
          AI features, your prompts, selected workspace context, and related
          inputs may be sent through an AI Gateway to model providers including
          Google AI, Anthropic, and OpenAI for processing. We also send your{" "}
          <code>userId</code> as attribution metadata through the AI Gateway.
        </p>

        <h3>Web search data</h3>
        <p>
          If you use AI features that perform web search or grounding, the
          search query you enter is sent to Google services used for grounding
          and search retrieval, including Google Vertex AI or Google AI tooling
          selected by the service.
        </p>

        <h3>Analytics data</h3>
        <p>
          We use PostHog for analytics. PostHog receives pageviews, feature
          usage, and product event data. For identified users, PostHog may also
          receive your user ID, email, name, profile image, email verification
          status, and account creation timestamp. PostHog uses cookies and local
          storage for session tracking and analytics features.
        </p>

        <h3>Telemetry and observability</h3>
        <p>
          We export server-side request traces and observability data through
          OpenTelemetry tooling to{" "}
          <a href="https://ingest.thecontext.company">
            ingest.thecontext.company
          </a>
          .
        </p>

        <h3>Email addresses for invitations</h3>
        <p>
          If you invite collaborators to a workspace, we collect and process the
          email addresses used for those invitations and send invitation emails
          through Resend.
        </p>

        <h3>Google Drive and Google Docs exports</h3>
        <p>
          If you initiate an export to Google Drive or Google Docs, we send the
          selected workspace content to Google using OAuth permissions that
          include the limited <code>drive.file</code> scope.
        </p>
      </section>

      <section>
        <h2>3. How we use data</h2>
        <p>We use personal data to:</p>
        <ul>
          <li>authenticate you and maintain your session;</li>
          <li>create, host, sync, and secure workspaces and collaborations;</li>
          <li>store and deliver uploads and exports you request;</li>
          <li>operate chat, AI assistance, and search-grounded responses;</li>
          <li>send transactional emails such as workspace invitations;</li>
          <li>understand product usage, improve features, and debug issues;</li>
          <li>protect the service against abuse, fraud, and security risks;</li>
          <li>comply with legal obligations and enforce our Terms.</li>
        </ul>
      </section>

      <section>
        <h2>4. Third-party services and disclosures</h2>
        <p>
          We share data with service providers that help us operate ThinkEx.
          These include:
        </p>
        <ul>
          <li>
            <strong>PostHog</strong> for analytics and product usage tracking,
            hosted in the United States at <code>us.posthog.com</code>;
          </li>
          <li>
            <strong>Google Cloud and Google services</strong> for Google OAuth,
            Google AI features, Google Drive exports, web search grounding, and
            certain integrations such as YouTube-related processing when you use
            those features;
          </li>
          <li>
            <strong>Supabase</strong> for file storage and realtime features;
          </li>
          <li>
            <strong>Resend</strong> for transactional emails such as workspace
            invitations;
          </li>
          <li>
            <strong>Vercel</strong> for hosting and application infrastructure;
          </li>
          <li>
            <strong>OpenTelemetry / Context Company</strong> for telemetry and
            trace ingestion;
          </li>
          <li>
            <strong>AI model providers via AI Gateway</strong>, including
            Google, Anthropic, and OpenAI, for AI inference and related
            processing.
          </li>
        </ul>
        <p>
          We may also disclose information where necessary to comply with law,
          respond to valid legal process, protect users, investigate misuse, or
          enforce our agreements.
        </p>
      </section>

      <section>
        <h2>5. Collaboration and sharing</h2>
        <p>
          If you invite collaborators or share a workspace, the people you
          invite may be able to view, edit, copy, export, or further share the
          content available in that workspace, depending on the permissions and
          features in use.
        </p>
      </section>

      <section>
        <h2>6. Data retention</h2>
        <ul>
          <li>Account data is retained until account deletion.</li>
          <li>
            Workspace data is retained until the workspace is deleted or your
            account is deleted.
          </li>
          <li>Session data is configured with a 30-day expiry.</li>
          <li>
            Analytics data is retained according to PostHog&apos;s retention
            settings and policies.
          </li>
          <li>
            Files are retained until you manually delete them or your account is
            deleted.
          </li>
        </ul>
      </section>

      <section>
        <h2>7. Data security</h2>
        <p>
          We use reasonable technical and organizational safeguards, including:
        </p>
        <ul>
          <li>HTTPS encryption in transit;</li>
          <li>
            secure authentication cookies configured with HttpOnly, Secure, and
            SameSite=lax attributes where applicable;
          </li>
          <li>database access controls and authenticated access policies;</li>
          <li>
            OAuth-based sign-in flows, which means we do not store passwords for
            the hosted ThinkEx service.
          </li>
        </ul>
        <p>
          No internet-based service can be guaranteed completely secure, and you
          use ThinkEx at your own risk.
        </p>
      </section>

      <section>
        <h2>8. Your rights and choices</h2>
        <p>
          Depending on where you live, you may have rights to access, correct,
          delete, restrict, port, or object to our processing of your personal
          data.
        </p>
        <ul>
          <li>
            <strong>Access and correction:</strong> you may request a copy of or
            correction to your personal data.
          </li>
          <li>
            <strong>Deletion:</strong> you may delete your account. ThinkEx
            supports account deletion, and user deletion cascades to associated
            workspaces according to the current hosted implementation.
          </li>
          <li>
            <strong>Export:</strong> you may export workspace content using the
            product&apos;s export features, including exports to Google Docs or
            Google Drive where supported.
          </li>
        </ul>

        <h3>California rights</h3>
        <p>
          California residents may have rights under the CCPA, including the
          right to know what personal information we collect, use, disclose, and
          retain; the right to request deletion; and the right not to be
          discriminated against for exercising privacy rights.
        </p>

        <h3>European rights</h3>
        <p>
          Individuals in the EEA, UK, or Switzerland may have GDPR-style rights
          including access, rectification, erasure, restriction, portability,
          and objection.
        </p>

        <p>
          To exercise privacy rights, contact{" "}
          <a href="mailto:hello@thinkex.app">hello@thinkex.app</a>.
        </p>
      </section>

      <section>
        <h2>9. Children&apos;s privacy</h2>
        <p>
          ThinkEx is not intended for children under 13, and we do not knowingly
          collect personal data from children under 13. If you believe a child
          has provided personal data to ThinkEx, contact us so we can take
          appropriate action.
        </p>
      </section>

      <section>
        <h2>10. International processing</h2>
        <p>
          ThinkEx and our service providers may process data in the United
          States and other countries where our providers operate. By using the
          service, you understand that your information may be transferred to
          jurisdictions that may have different data protection laws than your
          home country.
        </p>
      </section>

      <section>
        <h2>11. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. If we make
          material changes, we will update the effective date on this page and
          may provide additional notice where appropriate.
        </p>
      </section>

      <section>
        <h2>12. Contact</h2>
        <p>
          If you have questions or privacy requests, email{" "}
          <a href="mailto:hello@thinkex.app">hello@thinkex.app</a>.
        </p>
      </section>
    </>
  );
}
