import { z } from "zod";

export const taskStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "cancelled",
  "not_found",
]);

export type TaskStatus = z.infer<typeof taskStatusSchema>;

export interface TaskStartResult {
  runId: string;
  itemIds: string[];
}

export interface TaskStatusResult {
  status: TaskStatus;
  error?: string;
  result?: unknown;
}
