import { apiError, getRequestId } from "#/lib/api/response";

const agentDescriptionLink = '<https://thinkex.app/llms.txt>; rel="describedby"';
const serviceDocumentationLink = '<https://docs.thinkex.app/guides/mcp>; rel="service-doc"';

const homepageMarkdown = `# ThinkEx

> ThinkEx is a workspace for study, research, and creation grounded in your sources.

## What you can do

Bring PDFs, slides, images, recordings, and other source material into one organized workspace. Use folders inside folders, collaborate live with other people, and keep the material for each class, research project, or body of work together.

Ask questions across your sources and get answers with citations back to the original material. ThinkEx can also search a curated index of academic papers. You choose among supported AI models instead of being locked to one provider.

Create flashcards, quizzes, documents, and interactive widgets from the same workspace. ThinkEx is designed to keep source material, AI work, and the things you create connected instead of losing them in separate chats.

## For agents and developers

- [Agent guide](https://thinkex.app/llms.txt): Curated machine-readable links for ThinkEx.
- [ThinkEx documentation](https://docs.thinkex.app): Product and self-hosting documentation.
- [ThinkEx MCP server](https://docs.thinkex.app/guides/mcp): Connect an AI client to ThinkEx workspaces over MCP and OAuth.
- [Sitemap](https://thinkex.app/sitemap.xml): Index of public pages.
- [Developer resources](https://thinkex.app/developers): Supported integration surfaces and source code.
`;

type Representation = "html" | "markdown";

function qualityFor(accept: string, representation: Representation) {
	const target = representation === "html" ? "text/html" : "text/markdown";
	let best = { position: Number.POSITIVE_INFINITY, quality: 0, specificity: -1 };

	for (const [position, entry] of accept.split(",").entries()) {
		const [range = "", ...parameters] = entry.trim().toLowerCase().split(";");
		const specificity = range === target ? 2 : range === "text/*" ? 1 : range === "*/*" ? 0 : -1;
		if (specificity < 0) continue;

		const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
		const parsedQuality = qualityParameter
			? Number.parseFloat(qualityParameter.trim().slice(2))
			: 1;
		const quality = Number.isFinite(parsedQuality) ? Math.min(1, Math.max(0, parsedQuality)) : 0;

		if (
			specificity > best.specificity ||
			(specificity === best.specificity && position < best.position)
		) {
			best = { position, quality, specificity };
		}
	}

	return best;
}

function selectRepresentation(accept: string | null): Representation | null {
	if (!accept) return "html";

	const html = qualityFor(accept, "html");
	const markdown = qualityFor(accept, "markdown");

	if (html.quality === 0 && markdown.quality === 0) return null;
	if (markdown.quality !== html.quality)
		return markdown.quality > html.quality ? "markdown" : "html";
	if (markdown.specificity !== html.specificity)
		return markdown.specificity > html.specificity ? "markdown" : "html";

	return markdown.position < html.position ? "markdown" : "html";
}

function withNegotiationVary(headers: Headers) {
	const vary = headers.get("Vary");
	const fields = vary ? vary.split(",").map((field) => field.trim()) : [];
	for (const required of ["Accept", "Accept-Encoding"]) {
		if (!fields.some((field) => field.toLowerCase() === required.toLowerCase())) {
			fields.push(required);
		}
	}
	headers.set("Vary", fields.join(", "));
}

function responseWithBody(
	response: Response,
	body: BodyInit | null,
	headers: Headers,
	status = response.status,
) {
	return new Response(body, {
		headers,
		status,
		statusText: status === response.status ? response.statusText : undefined,
	});
}

export function negotiatePublicResponse(request: Request, response: Response) {
	const { pathname } = new URL(request.url);
	const isHtml = response.headers.get("content-type")?.includes("text/html") ?? false;

	if (pathname.startsWith("/api/") && response.status >= 400 && isHtml) {
		return apiError(
			getRequestId(request),
			response.status,
			"API_NOT_FOUND",
			`No ThinkEx API endpoint exists at ${pathname}.`,
			{ resolution: "See https://thinkex.app/developers for supported integrations." },
		);
	}

	if (!isHtml || (pathname !== "/" && response.status !== 404)) return response;

	const headers = new Headers(response.headers);
	withNegotiationVary(headers);
	const representation = selectRepresentation(request.headers.get("Accept"));

	if (!representation) {
		headers.set("content-type", "text/plain; charset=utf-8");
		return responseWithBody(
			response,
			request.method === "HEAD" ? null : "Not Acceptable\n",
			headers,
			406,
		);
	}

	if (representation === "html") return responseWithBody(response, response.body, headers);

	headers.set("content-type", "text/markdown; charset=utf-8");
	const markdown =
		response.status === 404
			? `# ThinkEx page not found\n\nNo public page exists at \`${pathname}\`.\n\n- [ThinkEx home](https://thinkex.app/)\n- [Agent guide](https://thinkex.app/llms.txt)\n- [Developer resources](https://thinkex.app/developers)\n- [Sitemap](https://thinkex.app/sitemap.xml)\n- [Documentation](https://docs.thinkex.app/)\n`
			: homepageMarkdown;

	return responseWithBody(response, request.method === "HEAD" ? null : markdown, headers);
}

export function addPublicDiscoveryHeaders(headers: Headers, request: Request) {
	if (new URL(request.url).pathname === "/") {
		headers.append("Link", agentDescriptionLink);
		headers.append("Link", serviceDocumentationLink);
	}
}
