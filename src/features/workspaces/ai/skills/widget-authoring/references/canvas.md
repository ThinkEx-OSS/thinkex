# Canvas drawing

A canvas has a CSS layout size and a separate pixel backing store. Derive both drawing dimensions from its measured box, scale the backing store for the device pixel ratio, and redraw after resize, input changes, and theme changes.

```html
<style>
	.tx-canvas-wrap {
		height: 320px;
	}
	.tx-canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
<div class="tx-canvas-wrap"><canvas class="tx-canvas" id="canvas"></canvas></div>
<script>
	const canvas = document.getElementById("canvas");
	const context = canvas.getContext("2d");

	function draw() {
		const rect = canvas.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;

		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.round(rect.width * dpr);
		canvas.height = Math.round(rect.height * dpr);
		context.setTransform(dpr, 0, 0, dpr, 0, 0);
		context.clearRect(0, 0, rect.width, rect.height);

		// Draw in CSS pixels using rect.width and rect.height.
	}

	new ResizeObserver(draw).observe(canvas);
	window.addEventListener("thinkex:themechange", draw);
</script>
```

Read theme colors inside `draw()` with `getComputedStyle(document.documentElement)` when pixels must use app tokens. Call `draw()` from every handler that changes the visualization's state.
