// Worker tests drive Durable Objects and server modules directly. The app entry
// serves the TanStack router, whose build-time virtual specifiers do not resolve
// under Vitest, so the test project runs against this handler-free entry instead.
export {
	AIThread,
	CodemodeRuntime,
	DocumentSession,
	OfficePdfConverter,
	Sandbox,
	UserAIStore,
	WorkspaceFileExtractionWorkflow,
	WorkspaceFileProcessor,
	WorkspaceRoom,
} from "#/durable-objects";

export default {
	fetch() {
		return new Response("Test worker entry", { status: 404 });
	},
} satisfies ExportedHandler<Cloudflare.Env>;
