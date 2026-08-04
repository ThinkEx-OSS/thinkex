---
name: widget-authoring
description: Author or edit ThinkEx widgets, which are self-contained interactive HTML blocks inside documents. Use when the user explicitly asks for a widget, asks for interaction or live computation, or wants a document visual that ordinary blocks cannot express.
---

# Author ThinkEx widgets

A widget is a document block whose HTML-escaped text content is one interactive HTML fragment:

```html
<div data-type="widget" title="Short title">&lt;style&gt;...&lt;/style&gt;...</div>
```

There is no separate widget item type. A document containing only this block acts as a standalone widget.

## Create

Follow this contract:

1. Supply fragment content only: HTML plus inline `<style>` and `<script>` elements. Omit `<!doctype>`, `<html>`, `<head>`, and `<body>` because the runtime supplies the document shell.
2. Write vanilla JavaScript inline. The opaque-origin frame cannot read ThinkEx cookies, storage, parent DOM, or workspace data. Its policy blocks connection APIs and external subresources. A script can still navigate its own frame, so keep all behavior local and never navigate.
3. Theme with the injected variables: `--background`, `--foreground`, `--card`, `--card-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--border`, `--input`, `--ring`, `--radius`, `--font-sans`, and `--font-mono`. The root also has `data-theme="light|dark"` and the `.dark` class.
4. Fit the host chrome. Start with the content itself because the block already provides its title, border, and gutter. Reserve panels and borders for distinct internal regions.
5. Let normal content determine height and fill the available width. Give only elements without natural height, such as a canvas or chart area, an explicit pixel height. The host clamps the frame between 120px and 720px and scrolls taller content.
6. Let failures throw. The runtime catches errors and offers the user an Ask AI to fix action.

Read these bundled references only when they apply:

- For a new widget or a ground-up rebuild, read `references/starter.md` before writing source.
- For any `<canvas>` drawing, read `references/canvas.md` before writing source.

Use the document tool's HTML math markup. After adding math dynamically, call `renderWidgetMath(element)`. KaTeX is the only bundled library; create other diagrams and charts with inline SVG or canvas.

## Edit

1. Read the document to locate the widget placeholder and its `data-edit-ref`.
2. Read that exact block with `{ mode: "block", path, editRef }` to obtain the current source and current `editRef`.
3. For a focused change, use `replace_text` with a `find` string copied exactly from the block read. Include enough surrounding text to make the match unique.
4. For a ground-up rebuild, read `references/starter.md`, then use `replace` on the widget's current `editRef`. Never use `overwrite`, which replaces the entire document.

Complete the operation only when the source follows the contract, every visible control works, runtime failures remain reportable, and an edit changes only the intended widget using the latest block read's exact `editRef`.
