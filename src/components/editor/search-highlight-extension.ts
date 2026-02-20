"use client";

import { createExtension } from "@blocknote/core";
import { search } from "prosemirror-search";
import "prosemirror-search/style/search.css";

/**
 * BlockNote extension that adds prosemirror-search plugin for citation highlight.
 * The plugin shows decoration-based highlights; the actual query is set via
 * setSearchState() dispatched from BlockNoteEditor when citationHighlightQuery changes.
 */
export const searchHighlightExtension = createExtension({
  key: "searchHighlight",
  prosemirrorPlugins: [
    search({
      // No initial query; BlockNoteEditor syncs from citationHighlightQuery store
    }),
  ],
});
