import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, type LegalDocument } from "#/components/LegalPage";
import { buildPublicMeta } from "#/lib/seo";

const privacyDocument = {
	title: "Privacy Policy",
	description:
		"This policy explains what ThinkEx Inc. collects, how we use it, and the choices you have when you use the workspace, document, file, sharing, and AI features.",
	sections: [
		{
			title: "Who we are",
			body: 'This policy is provided by ThinkEx Inc. ("ThinkEx," "we," "us," and "our"). ThinkEx Inc. is responsible for the personal information processed through the ThinkEx service.',
		},
		{
			title: "Information we collect",
			items: [
				"Account information, including your name, email address, profile image, authentication provider details, anonymous guest account status, session identifiers, IP address, and user agent.",
				"Workspace information, including workspace names, descriptions, membership roles, invites, documents, notes, folders, uploaded files, generated previews, extracted text, and collaboration activity.",
				"AI and tool activity, including prompts, selected workspace context, chat thread metadata, model selections, tool calls, tool results, and usage details needed to run and improve AI features.",
				"Feedback, support, invite, and account-deletion communications that you send to us or ask us to send.",
				"Usage, analytics, device, browser, error, and diagnostic information collected by the app and by configured analytics services.",
			],
		},
		{
			title: "How we use information",
			items: [
				"To provide, secure, debug, and improve ThinkEx.",
				"To authenticate users, maintain sessions, support guest accounts, and transfer guest work when an account is linked.",
				"To store, render, convert, extract, search, and share workspace content at your direction.",
				"To run AI chat, document reading, web research, code execution, model routing, usage tracking, and related tool activity.",
				"To send workspace invites, account-deletion verification emails, feedback notifications, security notices, and service messages.",
				"To detect abuse, enforce limits, protect accounts, and comply with legal obligations.",
			],
		},
		{
			title: "Service providers",
			body: "We use service providers to operate ThinkEx. Depending on the feature and environment, these may include Cloudflare for hosting, storage, databases, Durable Objects, Workers AI, Browser Rendering, email delivery, and sandboxed compute; Google for sign-in; Vercel AI Gateway and AI model providers such as OpenAI, Anthropic, and Google for AI responses; FileRouter and parsing providers such as LlamaParse for document extraction; Firecrawl for web and research extraction; PostHog for analytics, feedback, error reporting, session replay in deployed builds, and AI observability; and Autumn for AI usage tracking. These providers process data only as needed to provide their services to ThinkEx Inc.",
		},
		{
			title: "Workspace content and AI",
			body: "Your workspace content remains yours. When you use AI features, ThinkEx may send your prompt, selected workspace context, extracted text, file-derived content, and tool outputs to the configured AI or extraction providers so they can return a result. Do not use ThinkEx for highly sensitive information unless you are comfortable with this processing.",
		},
		{
			title: "Cookies and local storage",
			body: "ThinkEx uses cookies and browser storage for authentication, security, preferences, workspace UI state, analytics, feedback, error reporting, and session replay where configured. See the Cookie Policy for more detail.",
		},
		{
			title: "Retention and deletion",
			body: "We keep account, workspace, file, invite, chat, analytics, and diagnostic information for as long as needed to provide ThinkEx, maintain security, comply with legal obligations, resolve disputes, and improve the service. You can request account deletion from settings. Account deletion removes your account resources and purges workspaces you own, including their items and files. Some logs, backups, analytics, security records, or provider records may remain for a limited period where required for operations, security, or legal compliance.",
		},
		{
			title: "Your choices",
			items: [
				"You can update or delete workspace content inside the app.",
				"You can delete your account from settings after email verification.",
				"You can control cookies and browser storage through your browser, though blocking required cookies may break sign-in and core app features.",
				"You can contact us to request access, correction, export, deletion, or other privacy help.",
			],
		},
		{
			title: "Children",
			body: "ThinkEx is not intended for children under 13. If you believe a child under 13 has provided personal information, contact us so we can take appropriate action.",
		},
		{
			title: "Security",
			body: "We use technical and organizational safeguards such as access controls, security headers, authenticated workspace access, scoped upload validation, and provider-backed infrastructure. No internet service can guarantee perfect security.",
		},
		{
			title: "Contact",
			body: "For privacy questions or requests, email hello@thinkex.app.",
		},
	],
} satisfies LegalDocument;

export const Route = createFileRoute("/privacy")({
	head: () => ({
		meta: buildPublicMeta({
			title: "Privacy Policy",
			description: privacyDocument.description,
		}),
	}),
	component: PrivacyPage,
});

function PrivacyPage() {
	return <LegalPage document={privacyDocument} />;
}
