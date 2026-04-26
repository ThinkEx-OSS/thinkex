import { defineQueries, defineQuery } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "./zero-schema.gen";

export const queries = defineQueries({
  workspace: {
    items: defineQuery(
      z.object({ workspaceId: z.string() }),
      ({ args: { workspaceId } }) =>
        zql.workspace_items
          .where("workspaceId", workspaceId)
          .related("workspaceItemContent"),
    ),
    events: defineQuery(
      z.object({
        workspaceId: z.string(),
        limit: z.number().int().min(1).max(500).default(50),
      }),
      ({ args: { workspaceId, limit } }) =>
        zql.workspace_events
          .where("workspaceId", workspaceId)
          .orderBy("updatedAt", "desc")
          .limit(limit),
    ),
  },
});
