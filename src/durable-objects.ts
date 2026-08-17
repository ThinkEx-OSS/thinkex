// Single source of truth for the Worker's stateful exports. The app entry and
// the test entry both re-export this list so a new Durable Object cannot reach
// production while staying invisible to the worker test project.
// Required entry export even without a wrangler binding: the MCP feature's
// codemode executor spawns it via ctx.exports loopback (see
// @cloudflare/codemode/dist/vite.js, which would inject this if missing).
export { CodemodeRuntime } from "@cloudflare/codemode";
export { OfficePdfConverter } from "#/features/workspaces/conversion/office-pdf-converter";
export { DocumentSession } from "#/features/workspaces/documents/document-session";
export { WorkspaceFileExtractionWorkflow } from "#/features/workspaces/extraction/workspace-file-extraction-workflow";
export { WorkspaceFileProcessor } from "#/features/workspaces/files/workspace-file-processor";
export { WorkspaceRoom } from "#/features/workspaces/realtime/workspace-room";
