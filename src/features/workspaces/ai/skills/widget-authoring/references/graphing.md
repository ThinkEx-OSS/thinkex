# Graphing

Two libraries are bundled for function graphs. Reference them only when the widget plots a function; an ordinary widget loads neither.

- `math` is [mathjs](https://mathjs.org). Use `math.compile(source)` once, then `compiled.evaluate({ x })` for each point. It parses the user's own expression, so never build a graph's expression parser by hand.
- `uPlot` draws the axes, grid, ticks, and lines. Give its target element an explicit height and pass the width from the element's measured box.

uPlot draws to a canvas, so its colors must be concrete values, not CSS variables. Read the theme tokens with `getComputedStyle` and rebuild the plot on `thinkex:themechange`. Pass `null` for a point that is not finite so a discontinuity leaves a gap instead of a spike.

```html
<style>
	.tx-plot {
		width: 100%;
		height: 320px;
	}
</style>
<div class="tx-stack">
	<div class="tx-row">
		<input id="expr" value="sin(x)" aria-label="Function of x" />
		<button id="draw" data-variant="primary">Plot</button>
	</div>
	<div class="tx-panel tx-visual"><div class="tx-plot" id="chart"></div></div>
</div>
<script>
	const chart = document.getElementById("chart");
	const input = document.getElementById("expr");
	let plot = null;

	function token(name, fallback) {
		const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
		return value || fallback;
	}

	function sample(source) {
		const compiled = math.compile(source);
		const xs = [];
		const ys = [];
		for (let x = -10; x <= 10; x += 0.05) {
			const y = compiled.evaluate({ x });
			xs.push(x);
			ys.push(Number.isFinite(y) ? y : null);
		}
		return [xs, ys];
	}

	function render() {
		let data;
		try {
			data = sample(input.value);
		} catch (error) {
			// A bad expression is the user's typo, not a widget crash.
			input.setAttribute("aria-invalid", "true");
			return;
		}
		input.removeAttribute("aria-invalid");

		const axis = {
			stroke: token("--muted-foreground", "#888"),
			grid: { stroke: token("--border", "#ddd") },
		};
		plot?.destroy();
		plot = new uPlot(
			{
				width: chart.clientWidth,
				height: chart.clientHeight,
				legend: { show: false },
				scales: { x: { time: false } },
				series: [{}, { stroke: token("--chart-1", "#4f46e5"), width: 2, points: { show: false } }],
				axes: [axis, axis],
			},
			data,
			chart,
		);
	}

	document.getElementById("draw").addEventListener("click", render);
	new ResizeObserver(() =>
		plot?.setSize({ width: chart.clientWidth, height: chart.clientHeight }),
	).observe(chart);
	window.addEventListener("thinkex:themechange", render);
	render();
</script>
```
