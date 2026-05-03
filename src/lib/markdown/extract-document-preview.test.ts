import { describe, expect, it } from "vitest";
import { extractDocumentPreview } from "./extract-document-preview";

describe("extractDocumentPreview", () => {
  it("preserves inline code content", () => {
    expect(extractDocumentPreview("Use `pnpm dev` to start.")).toContain(
      "pnpm dev",
    );
  });

  it("preserves fenced code block content while removing fences", () => {
    const preview = extractDocumentPreview([
      "Before",
      "```ts",
      "const answer = 42;",
      "console.log(answer);",
      "```",
      "After",
    ].join("\n"));

    expect(preview).toContain("const answer = 42;");
    expect(preview).toContain("console.log(answer);");
    expect(preview).not.toContain("```");
  });
});
