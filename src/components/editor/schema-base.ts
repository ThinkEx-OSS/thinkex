import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";
import { MathBlock } from "./blocks/MathBlock";
import { CodeBlock } from "./blocks/CodeBlock";
import { InlineMath } from "./inline/InlineMath";

// Extract file block and native codeBlock from defaultBlockSpecs to exclude them
const { file: _, codeBlock: _cb, ...blocksWithoutFileAndCode } = defaultBlockSpecs;

// Workaround for BlockNote bug: numberedListItem.start defaults to undefined,
// causing RangeError when parsing Markdown with ordered lists.
// Fix: Override numberedListItem to set start default to 1
const fixedBlockSpecs = {
  ...blocksWithoutFileAndCode,
  numberedListItem: {
    ...blocksWithoutFileAndCode.numberedListItem,
    config: {
      ...blocksWithoutFileAndCode.numberedListItem.config,
      propSchema: {
        ...blocksWithoutFileAndCode.numberedListItem.config.propSchema,
        start: {
          ...blocksWithoutFileAndCode.numberedListItem.config.propSchema.start,
          default: 1 as const,
        },
      },
    },
  },
  // Fix for image block: set default previewWidth to 512
  image: {
    ...blocksWithoutFileAndCode.image,
    config: {
      ...blocksWithoutFileAndCode.image.config,
      propSchema: {
        ...blocksWithoutFileAndCode.image.config.propSchema,
        previewWidth: {
          ...blocksWithoutFileAndCode.image.config.propSchema.previewWidth,
          default: 512 as const,
        },
      },
    },
  },
};

// Create custom schema with Math block and custom React code block
// File blocks are disabled - only image blocks are allowed
// This is the base schema without "use client" directive
// Using the new API: create() with blockSpecs, then extend() for additional blocks
export const schema = BlockNoteSchema.create({
  blockSpecs: {
    // Include all default blocks except file block and native codeBlock
    ...fixedBlockSpecs,
    // Custom React-based code block with language selector and copy button
    // Override createHighlighter to use one-dark-pro theme (matching BlockNotePreview)
    codeBlock: CodeBlock({
      ...codeBlockOptions,
      createHighlighter: () =>
        codeBlockOptions.createHighlighter().then(async (highlighter: any) => {
          await highlighter.loadTheme(import("@shikijs/themes/one-dark-pro"));
          return highlighter;
        }),
    } as any),
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

