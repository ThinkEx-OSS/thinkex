/**
 * Mistral OCR returns figure regions as `![id](id)` in markdown plus a parallel `images[]`
 * with `image_annotation` JSON when `bbox_annotation_format` is set.
 * We merge annotations into markdown at ingest so downstream code only sees inline text.
 */

/** JSON schema for per-figure captions (Mistral bbox annotation). */
export const MISTRAL_BBOX_ANNOTATION_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "figure_annotation",
    strict: true,
    schema: {
      type: "object",
      properties: {
        short_description: {
          type: "string",
          description:
            "Concise description of what the figure shows, suitable for inline document text.",
        },
      },
      required: ["short_description"],
      additionalProperties: false,
    },
  },
} as const;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatAnnotationForInline(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const short =
      typeof obj.short_description === "string" ? obj.short_description.trim() : "";
    return short || null;
  } catch {
    return null;
  }
}

/**
 * Replaces `![alt](id)` image placeholders with inline figure descriptions.
 * Unknown ids or missing annotations are left unchanged.
 */
export function mergeFigureAnnotationsIntoMarkdown(
  markdown: string,
  images?: ReadonlyArray<{
    id?: string;
    image_annotation?: string | null;
  }> | null,
): string {
  if (!images?.length) return markdown;

  const byId = new Map<string, string>();
  for (const img of images) {
    const id = img.id;
    if (!id) continue;
    const text = formatAnnotationForInline(img.image_annotation);
    if (text) byId.set(id, text);
  }
  if (byId.size === 0) return markdown;

  let out = markdown;
  for (const [id, replacement] of byId) {
    const pattern = new RegExp(`!\\[[^\\]]*\\]\\(${escapeRegex(id)}\\)`, "g");
    out = out.replace(pattern, () => `\n\n${replacement}\n\n`);
  }
  return out;
}
