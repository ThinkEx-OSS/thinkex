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
3. Use a **native shell and expressive core**. Let the runtime style structural UI such as type, controls, focus, spacing, and panels. Give the diagram, simulation, chart, game, or other central experience the custom SVG, canvas, color, and motion it needs.
4. Fit the host chrome. The block already provides its title, border, background, and gutter, so never repeat the widget title or wrap the entire source in another card. Reserve panels and borders for distinct internal regions.
5. Let normal content determine height and fill the available width. Give only elements without natural height, such as a canvas or chart area, an explicit pixel height. The host clamps the frame between 120px and 720px and scrolls taller content.
6. Create and edit tools validate inline script syntax before saving. If one returns `widget_script_syntax_error`, use its detail to repair the existing source and retry the same write. Let later runtime failures throw; the sandbox catches them and offers the user an Ask AI to fix action.

Compose the experience before coding it:

1. Choose one primary interaction or visual and make it dominant. Group its controls together and keep supporting explanation secondary.
2. Prefer the runtime's standard controls and `.tx-stack`, `.tx-row`, `.tx-panel`, `.tx-muted`, and `.tx-visual` helpers over rebuilding structural styles. Mark at most one main button with `data-variant="primary"`.
3. Theme structural UI with the semantic background, foreground, card, primary, secondary, muted, accent, border, input, ring, radius, and font variables. Use `--success`, `--warning`, `--info`, and `--destructive` for status, and `--chart-1` through `--chart-6` for data and expressive visuals. The root also has `data-theme="light|dark"` and the `.dark` class. Hard-code a color only when its literal identity carries meaning.
4. Keep interface text compact, make layouts wrap on narrow widths, label controls, and ensure every visible control works. Use motion to explain state changes rather than as decoration.

For a complex widget with several interactions or a large script, build in working slices. Create the smallest complete version that delivers the primary interaction, then follow the Edit workflow to add one coherent capability at a time with focused `replace_text` edits. Every saved slice must be functional and presentable; never publish scaffolding, placeholder regions, or dead controls. Create ordinary widgets in one write.

Read these bundled references only when they apply:

- For a new widget or a ground-up rebuild, read `references/starter.md` before writing source.
- For any `<canvas>` drawing, read `references/canvas.md` before writing source.

Use the document tool's HTML math markup. The runtime renders matching math elements when they are added or changed. KaTeX is the only bundled library; create other diagrams and charts with inline SVG or canvas.

## Edit

1. Read the document to locate the widget placeholder and its `data-edit-ref`.
2. Read that exact block with `{ mode: "block", path, editRef }` to obtain the current source and current `editRef`.
3. For a focused change, use `replace_text` with a `find` string copied exactly from the block read. Include enough surrounding text to make the match unique.
4. For a ground-up rebuild, read `references/starter.md`, then use `replace` on the widget's current `editRef`. Never use `overwrite`, which replaces the entire document.

Complete the operation only when the source follows the contract, the main interaction or visual is immediately clear, the widget has no duplicate host chrome or unintended overflow, every visible control works, both themes remain readable, runtime failures remain reportable, and an edit changes only the intended widget using the latest block read's exact `editRef`.
