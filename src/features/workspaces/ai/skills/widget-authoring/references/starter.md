# Widget starter

Use this as the structural baseline for a new widget. Adapt the controls and behavior to the request. Keep the content root unframed because ThinkEx supplies the outer title, border, and gutter.

```html
<style>
	.tx-root {
		display: flex;
		flex-direction: column;
		gap: 12px;
		color: var(--foreground);
		font: inherit;
	}
	.tx-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	.tx-button {
		padding: 8px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--primary);
		color: var(--primary-foreground);
		cursor: pointer;
		font: inherit;
	}
	.tx-muted {
		color: var(--muted-foreground);
	}
</style>
<div class="tx-root">
	<div id="output" aria-live="polite">Ready.</div>
	<div class="tx-controls">
		<button class="tx-button" id="action" type="button">Run</button>
	</div>
</div>
<script>
	const output = document.getElementById("output");
	document.getElementById("action").addEventListener("click", () => {
		output.textContent = "Done.";
	});
</script>
```

Before writing the block, replace placeholder behavior and labels, wire every visible control, and HTML-escape the complete fragment inside the widget element.
