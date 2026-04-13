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
  },
});
