import { describe, expect, it } from "vitest";
import { mergeFigureAnnotationsIntoMarkdown } from "../ocr-figure-inline";

describe("mergeFigureAnnotationsIntoMarkdown", () => {
  it("replaces ![alt](id) placeholders with figure descriptions", () => {
    const md = "Intro\n\n![fig](img-1)\n\nOutro";
    const images = [
      {
        id: "img-1",
        image_annotation: JSON.stringify({ short_description: "A bar chart of sales." }),
      },
    ];
    expect(mergeFigureAnnotationsIntoMarkdown(md, images)).toBe(
      "Intro\n\n\n\nA bar chart of sales.\n\n\n\nOutro",
    );
  });

  it("skips image entries without id", () => {
    const md = "![x](keep-me)";
    expect(
      mergeFigureAnnotationsIntoMarkdown(md, [
        { image_annotation: JSON.stringify({ short_description: "ignored" }) },
      ]),
    ).toBe(md);
  });

  it("ignores invalid JSON in image_annotation without throwing", () => {
    const md = "![a](id1)";
    expect(
      mergeFigureAnnotationsIntoMarkdown(md, [{ id: "id1", image_annotation: "not-json{" }]),
    ).toBe(md);
  });

  it("ignores annotations with empty short_description", () => {
    const md = "![a](id1)";
    expect(
      mergeFigureAnnotationsIntoMarkdown(md, [
        { id: "id1", image_annotation: JSON.stringify({ short_description: "" }) },
      ]),
    ).toBe(md);
  });

  it("leaves markdown unchanged when no placeholder matches an id", () => {
    const md = "No figures here.";
    const images = [
      {
        id: "missing-from-md",
        image_annotation: JSON.stringify({ short_description: "orphan" }),
      },
    ];
    expect(mergeFigureAnnotationsIntoMarkdown(md, images)).toBe(md);
  });

  it("inserts descriptions literally when they contain $ (no replacement pattern corruption)", () => {
    const md = "![f](img-1)";
    const desc = "Costs are $5 and $10";
    const images = [
      {
        id: "img-1",
        image_annotation: JSON.stringify({ short_description: desc }),
      },
    ];
    expect(mergeFigureAnnotationsIntoMarkdown(md, images)).toContain(desc);
  });

  it("returns original markdown when images is empty or undefined", () => {
    const md = "x";
    expect(mergeFigureAnnotationsIntoMarkdown(md, [])).toBe(md);
    expect(mergeFigureAnnotationsIntoMarkdown(md, undefined)).toBe(md);
    expect(mergeFigureAnnotationsIntoMarkdown(md, null)).toBe(md);
  });
});
