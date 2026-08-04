---
name: widget-authoring
description: Author and edit widgets — interactive document blocks whose self-contained HTML runs sandboxed in ThinkEx. Use whenever the user asks for something interactive to be built or changed — a simulation, calculator, diagram, quiz game, flashcard drill, timer, chart, or any small interactive tool or visualization.
---

# Authoring ThinkEx widgets

A **widget** is a block inside a document whose content is a single, self-contained interactive HTML fragment. It renders inside a sandboxed `<iframe>` with an **opaque origin**: it cannot reach the network, cookies, storage, the parent page, or any workspace data. It is purely a self-contained interactive experience.

Create one by writing a `<div data-type="widget" title="...">` into a document — its source is the element's text content, HTML-escaped. There is no separate widget item type: a document holding nothing but a widget is how a standalone widget is made.

## When to reach for a widget block

Use a **widget block** when the value is in _interaction or live computation_: a physics simulation, a calculator, an adjustable diagram, a quiz game with scoring, a drawing tool, a data visualization the user can tweak, a timer. Only a widget can run JavaScript.

Use **ordinary blocks** when the value is in _rich text_: notes, explanations, structured study material, tables of static content. Most documents want both — prose that explains, and one widget that lets the reader try it.

## The HTML contract (read this before writing any widget)

1. **Fragment only.** Provide the inner content only — HTML, one or more inline `<style>` blocks, and inline `<script>`. Do **NOT** include `<!doctype>`, `<html>`, `<head>`, or `<body>`. The sandbox wraps your fragment in a full document.
2. **All JS is inline.** No external scripts, no `import`, no `fetch`, no network, no CDN links. `connect-src` is blocked and external scripts will not load. Write vanilla JS (or hand-rolled helpers) inline in a `<script>` tag.
3. **Theme with the app's CSS variables.** The host injects these variables so the widget looks native in light and dark mode. Use them instead of hard-coded colors:
   `--background`, `--foreground`, `--card`, `--card-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--border`, `--input`, `--ring`, `--radius`.
   The sandbox toggles a `.dark` class on the root element when the app is in dark mode; because you use the variables, you rarely need to special-case `.dark` yourself.
4. **No chrome of your own.** The block already draws a border and a title strip showing the `title` attribute, and the surrounding prose says what the widget is for. So do **not** repeat the title as a heading, and do **not** wrap everything in an outer bordered/rounded panel. Start straight into the content. Borders and `var(--card)` backgrounds are for genuinely separate sub-regions (a stat tile, a chart panel), never the outer shell. One short line of instructions is fine when it says something the title doesn't.
5. **Let the height come from your content.** The block measures what you render and sizes itself to match, between 120px and 720px; past that it scrolls. So do **not** set `height: 100%` on your root — there is no fixed frame to fill, and it will collapse. Give any element that has no natural height — a `<canvas>`, a chart area, a map — an explicit height in px, and let everything else flow. Do **not** cap the width with `max-width`, centre it with `margin: auto`, or add outer padding. The frame is already the width of the document's text column and already provides a gutter, so anything on top of that only strands the content in dead space. Keep a widget to roughly one screenful: a compact layout beats one the reader has to scroll inside. Taller widgets still work — the reader can open any widget fullscreen — but the inline block is what they see first.
6. **Fail loudly, not silently.** If something can error, let it throw — the sandbox catches runtime errors and offers the user an "Ask AI to fix" button that sends the error back to you.

## Starter template

Note what is _absent_: no title, no outer panel. The content starts immediately.

```html
<style>
	.tx-root {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.tx-btn {
		padding: 8px 14px;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--primary);
		color: var(--primary-foreground);
		cursor: pointer;
		font: inherit;
	}
	/* Only for a distinct sub-region, never as an outer wrapper. */
	.tx-panel {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
		color: var(--card-foreground);
		padding: 16px;
	}
	.tx-muted {
		color: var(--muted-foreground);
	}
</style>
<div class="tx-root">
	<div class="tx-panel" id="output">…</div>
	<button class="tx-btn" id="action">Do it</button>
</div>
<script>
	const output = document.getElementById("output");
	document.getElementById("action").addEventListener("click", () => {
		output.textContent = "Clicked at " + new Date().toLocaleTimeString();
	});
</script>
```

## Math, diagrams, and charts

Math works exactly as it does in a document — `<span data-type="inline-math" data-latex="...">` — because both are HTML surfaces. The host loads KaTeX only when a widget contains math. `$$...$$` and `\(...\)` also render, but a lone `$` does not: it cannot be told apart from a price.

Call `renderWidgetMath(element)` if you add math to the DOM after load. A malformed expression renders muted in place and never breaks the widget.

No libraries are bundled beyond KaTeX: MathJax, Mermaid, D3, and every charting library are unavailable, and you cannot add your own `<script src="...">`. Draw diagrams as inline SVG you write yourself, and charts on `<canvas>` or SVG.

## Drawing with `<canvas>` (read this if the widget draws anything)

A canvas has two sizes: its CSS box and its backing store (`canvas.width`/`canvas.height`, default 300×150). If you only style it with CSS, your drawing is stretched or clipped — the usual symptom is a blank canvas with a smudge in one corner.

Always size the backing store from the measured layout box, account for device pixel ratio, and redraw on resize:

```html
<style>
	/* An explicit height: the block sizes itself to the content, so a canvas
	   with only a percentage height would measure zero and never appear. */
	.chart-wrap {
		height: 320px;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
<div class="chart-wrap"><canvas id="c"></canvas></div>
<script>
	const canvas = document.getElementById("c");
	const ctx = canvas.getContext("2d");

	function draw() {
		const rect = canvas.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return; // not laid out yet
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.round(rect.width * dpr);
		canvas.height = Math.round(rect.height * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
		ctx.clearRect(0, 0, rect.width, rect.height);
		// ...draw using rect.width / rect.height as your coordinate space...
	}

	new ResizeObserver(draw).observe(canvas); // fires once on first layout too
</script>
```

Key points: never draw using hard-coded pixel dimensions; derive everything from the measured `rect`. Re-run `draw()` whenever an input changes as well as on resize.

## Editing an existing widget

1. Read the document. A widget comes back as an empty placeholder carrying its `data-ref` and title, so the source does not crowd out the prose. Read that ref back with `{ mode: "block", path, ref }` to get the source in full — never edit a widget from the placeholder alone.
2. Prefer **targeted replacement**: `edits: [{ op: "replace_text", ref, find, replace }]`, where `ref` is the widget block's data-ref. Copy the exact current substring into `find`. It must match exactly once within that block — if it matches more than once the edit fails and tells you the count, so add surrounding context rather than guessing.
3. For a ground-up rebuild, `{ op: "replace", ref, html }` swaps the whole widget block. For small changes ("make the button red", "add a reset control"), use `replace_text`. Never reach for `overwrite` to change a widget — it discards the entire document.

## Good habits

- Keep it to one focused thing done well; don't build a whole app.
- Prefer semantic, legible markup and a small amount of CSS over sprawling styles.
- Label controls; make interactive elements keyboard-usable where it's easy.
- Use `<input type="range">`, buttons, and `<canvas>`/SVG freely — they all work.
