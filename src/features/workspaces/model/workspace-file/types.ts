import { z } from "zod";

export const workspaceFileAssetKinds = ["pdf", "image"] as const;
export const workspaceFileAssetKindSchema = z.enum(workspaceFileAssetKinds);

export type WorkspaceFileAssetKind = (typeof workspaceFileAssetKinds)[number];
