import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, createCodeBlockSpec } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";
import { MathBlock } from "./blocks/MathBlock";
import { InlineMath } from "./inline/InlineMath";

// Extract file block from defaultBlockSpecs to exclude it
const { file: _, ...blocksWithoutFile } = defaultBlockSpecs;

// Workaround for BlockNote bug: numberedListItem.start defaults to undefined,
// causing RangeError when parsing Markdown with ordered lists.
// Fix: Override numberedListItem to set start default to 1
const fixedBlockSpecs = {
  ...blocksWithoutFile,
  numberedListItem: {
    ...blocksWithoutFile.numberedListItem,
    config: {
      ...blocksWithoutFile.numberedListItem.config,
      propSchema: {
        ...blocksWithoutFile.numberedListItem.config.propSchema,
        start: {
          ...blocksWithoutFile.numberedListItem.config.propSchema.start,
          default: 1 as const,
        },
      },
    },
  },
  // Fix for image block: set default previewWidth to 512
  image: {
    ...blocksWithoutFile.image,
    config: {
      ...blocksWithoutFile.image.config,
      propSchema: {
        ...blocksWithoutFile.image.config.propSchema,
        previewWidth: {
          ...blocksWithoutFile.image.config.propSchema.previewWidth,
          default: 512 as const,
        },
      },
    },
  },
};

// Create custom schema with Math block and enhanced code block with syntax highlighting
// File blocks are disabled - only image blocks are allowed
// This is the base schema without "use client" directive
// Using the new API: create() with blockSpecs, then extend() for additional blocks
export const schema = BlockNoteSchema.create({
  blockSpecs: {
    // Include all default blocks except file block (paragraph, heading, list, image, etc.)
    ...fixedBlockSpecs,
    // Replace default codeBlock with enhanced version that has syntax highlighting
    codeBlock: createCodeBlockSpec(codeBlockOptions as any),
  },
  inlineContentSpecs: {
    // Include all default inline content (links, bold, italic, etc.)
    ...defaultInlineContentSpecs,
  },
}).extend({
  blockSpecs: {
    // Add custom Math block - call it as a function
    math: MathBlock(),
  },
  inlineContentSpecs: {
    // Add custom inline math
    inlineMath: InlineMath,
  },
});

// Export typed editor and block types for type safety
export type MyBlockNoteEditor = typeof schema.BlockNoteEditor;
export type MyBlock = typeof schema.Block;

