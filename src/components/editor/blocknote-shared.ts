import type { MyBlock } from "./schema-base";

export type Block = MyBlock;

export function plainTextToBlocks(text: string): Block[] {
  if (!text || text.trim() === "") {
    return [];
  }

  const lines = text.split("\n").filter((line) => line.trim() !== "");

  return lines.map((line) => ({
    type: "paragraph",
    content: [{ type: "text", text: line, styles: {} }],
  })) as Block[];
}
