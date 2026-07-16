import { z } from "zod";

import { mcpOperations } from "#/features/mcp/mcp-operation-catalog";

function toOpenApiSchema(schema: z.ZodType) {
	const { $schema: _schemaDialect, ...jsonSchema } = z.toJSONSchema(schema);
	return jsonSchema;
}

function buildOperationPath(operation: (typeof mcpOperations)[number]) {
	return {
		post: {
			operationId: operation.name,
			summary: operation.description,
			security: [{ oauth2: [operation.requiredScope] }],
			"x-thinkex-access": operation.access,
			"x-thinkex-effects": operation.effects,
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: toOpenApiSchema(operation.inputSchema),
					},
				},
			},
			responses: {
				"200": {
					description: "Operation result",
					content: {
						"application/json": {
							schema: toOpenApiSchema(operation.outputSchema),
						},
					},
				},
			},
		},
	};
}

export const mcpOpenApiSpec: Record<string, unknown> = {
	openapi: "3.1.0",
	info: {
		title: "ThinkEx workspace operations",
		version: "1.0.0",
		description:
			"Discover and execute ThinkEx workspace operations. Start with workspace_list to find the user's workspaces and membership roles.",
	},
	paths: Object.fromEntries(
		mcpOperations.map((operation) => [
			`/operations/${operation.name}`,
			buildOperationPath(operation),
		]),
	),
	components: {
		securitySchemes: {
			oauth2: {
				type: "oauth2",
				flows: {
					authorizationCode: {
						authorizationUrl: "/api/auth/oauth2/authorize",
						tokenUrl: "/api/auth/oauth2/token",
						scopes: {
							"workspaces:read": "Read workspaces the user belongs to.",
							"workspaces:write": "Modify workspaces when the user's role permits it.",
						},
					},
				},
			},
		},
	},
};
