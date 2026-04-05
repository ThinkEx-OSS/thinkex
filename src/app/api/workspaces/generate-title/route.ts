import { NextRequest, NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { requireAuth, withErrorHandling } from "@/lib/api/workspace-helpers";
import { CANVAS_CARD_COLORS } from "@/lib/workspace-state/colors";
import {
  WORKSPACE_ICON_NAMES,
  formatIconForStorage,
} from "@/lib/workspace-icons";
import { GOOGLE_MODEL_IDS } from "@/lib/ai/model-registry";

const MAX_TITLE_LENGTH = 60;

/**
 * POST /api/workspaces/generate-title
 * Generate a concise workspace title, icon, and color from a user prompt.
 */
async function handlePOST(request: NextRequest) {
  await requireAuth();

  let body;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return NextResponse.json(
        { error: "invalid JSON payload" },
        { status: 400 }
      );
    }
    throw error;
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

  if (!prompt) {
    return NextResponse.json(
      { error: "prompt is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  const { output } = await generateText({
    model: google(GOOGLE_MODEL_IDS.GEMINI_2_5_FLASH_LITE),
    output: Output.object({
      schema: z.object({
        title: z.string().describe("A short, concise workspace title (max 5-6 words)"),
        icon: z.string().describe("A Lucide icon name that represents the topic (must be one of the available icons)"),
        color: z.string().describe("A hex color code that fits the topic theme"),
      }),
    }),
    system: `You are a helpful assistant that generates workspace metadata. 
Given a user's prompt, generate:
1. A short, concise workspace title (max 5-6 words)
2. An appropriate Lucide icon name from the available icons list
3. A hex color code that matches the topic theme

Available icons (must be one of these exact names): ${WORKSPACE_ICON_NAMES.join(", ")}
Available colors should be vibrant and match the topic theme. Use hex format like #3B82F6.`,
    prompt: `User prompt: "${prompt}"

Generate appropriate workspace title, icon, and color for this topic.`,
  });

  let title = output.title.trim();
  if (title.length > MAX_TITLE_LENGTH) {
    title = title.substring(0, MAX_TITLE_LENGTH).trim();
  }
  if (!title) {
    title = "New Workspace";
  }

  // Validate icon - must be in the available icons list
  let icon = output.icon?.trim();
  if (!icon || !WORKSPACE_ICON_NAMES.includes(icon as (typeof WORKSPACE_ICON_NAMES)[number])) {
    icon = "Folder";
  }
  const iconStored = formatIconForStorage(icon);

  // Validate color - ensure it's a valid hex color, otherwise pick a random one from palette
  let color = output.color;
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    // Pick a random color from the palette
    const randomIndex = Math.floor(Math.random() * CANVAS_CARD_COLORS.length);
    color = CANVAS_CARD_COLORS[randomIndex];
  }

  return NextResponse.json({ title, icon: iconStored, color });
}

export const POST = withErrorHandling(handlePOST, "POST /api/workspaces/generate-title");
