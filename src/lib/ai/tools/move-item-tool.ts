import { tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import type { WorkspaceToolContext } from "./workspace-tools";
import { loadStateForTool, resolveItem, resolveFolderByName, withSanitizedModelOutput } from "./tool-utils";
import { normalizeWorkspaceItems } from "@/lib/workspace-state/state";

export function createMoveItemTool(ctx: WorkspaceToolContext) {
  return withSanitizedModelOutput(
    tool({
      description:
        "Move one or more workspace items to a different folder. " +
        "Provide an array of item names and the target folder name. " +
        "Use folderName=null or omit it to move items to the workspace root.",
      inputSchema: zodSchema(
        z.object({
          itemNames: z
            .array(z.string())
            .min(1)
            .describe("Array of item names to move (matched by fuzzy search)"),
          folderName: z
            .string()
            .nullable()
            .describe(
              "Name of the target folder (matched by fuzzy search). Use null to move to workspace root."
            ),
        })
      ),
      strict: true,
      execute: async (input: {
        itemNames: string[];
        folderName: string | null;
      }) => {
        const { itemNames, folderName } = input;

        if (!ctx.workspaceId) {
          return { success: false, message: "No workspace context available" };
        }

        try {
          const accessResult = await loadStateForTool(ctx);
          if (!accessResult.success) return accessResult;
          const state = normalizeWorkspaceItems(accessResult.state);

          let targetFolderId: string | null = null;
          if (folderName !== null && folderName !== undefined) {
            try {
              const resolved = resolveFolderByName(state, folderName);
              targetFolderId = resolved ?? null;
            } catch (error) {
              return {
                success: false,
                message: error instanceof Error ? error.message : String(error),
              };
            }
          }

          const resolvedItems: Array<{ id: string; name: string }> = [];
          const failedNames: string[] = [];

          for (const name of itemNames) {
            const item = resolveItem(state, name);
            if (item) {
              if (item.type === "folder" && item.id === targetFolderId) {
                failedNames.push(`"${name}" (cannot move folder into itself)`);
                continue;
              }
              resolvedItems.push({ id: item.id, name: item.name });
            } else {
              failedNames.push(`"${name}" (not found)`);
            }
          }

          if (resolvedItems.length === 0) {
            return {
              success: false,
              message: `Could not find any of the specified items. Failed: ${failedNames.join(", ")}`,
            };
          }

          await workspaceWorker("move", {
            workspaceId: ctx.workspaceId,
            itemIds: resolvedItems.map((i) => i.id),
            folderId: targetFolderId ?? undefined,
          });

          const targetLabel = folderName
            ? `folder "${folderName}"`
            : "workspace root";

          const result: Record<string, unknown> = {
            success: failedNames.length === 0,
            movedCount: resolvedItems.length,
            movedItems: resolvedItems.map((i) => i.name),
            targetFolder: folderName ?? "root",
            message:
              failedNames.length > 0
                ? `Moved ${resolvedItems.length} item(s) to ${targetLabel}. Failed: ${failedNames.join(", ")}`
                : `Moved ${resolvedItems.length} item(s) to ${targetLabel}.`,
          };

          if (failedNames.length > 0) {
            result.failedItems = failedNames;
          }

          return result;
        } catch (error) {
          logger.error("Error moving items:", error);
          return {
            success: false,
            message: `Error moving items: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    })
  );
}
