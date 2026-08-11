import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const outlineColors = ["#73BF7A", "#DA4944", "#5C8BD6", "#F7B53B"];

const logoSources = [
	{ sourcePath: "public/newlogothinkex-light.svg", outlineColors },
	{ sourcePath: "public/newlogothinkex-dark.svg", outlineColors },
	{ sourcePath: "public/favicon-dev.svg", outlineColors: ["#22D3EE"] },
	{ sourcePath: "docs/assets/thinkex-logo-wordmark-light.svg", outlineColors },
	{ sourcePath: "docs/assets/thinkex-logo-wordmark-dark.svg", outlineColors },
	{
		sourcePath: "src/features/workspaces/components/ai-chat/AiChatAssistantPending.tsx",
		outlineColors,
	},
];

type Bounds = { left: number; top: number; right: number; bottom: number };

function pathBounds(pathData: string): Bounds[] {
	const tokens = pathData.match(/[MHQVZ]|-?\d+(?:\.\d+)?/g) ?? [];
	const subpaths: Array<Array<[number, number]>> = [];
	let points: Array<[number, number]> = [];
	let x = 0;
	let y = 0;

	for (let index = 0; index < tokens.length;) {
		const command = tokens[index++];

		if (command === "M") {
			if (points.length > 0) subpaths.push(points);
			x = Number(tokens[index++]);
			y = Number(tokens[index++]);
			points = [[x, y]];
		} else if (command === "H") {
			x = Number(tokens[index++]);
			points.push([x, y]);
		} else if (command === "V") {
			y = Number(tokens[index++]);
			points.push([x, y]);
		} else if (command === "Q") {
			const controlX = Number(tokens[index++]);
			const controlY = Number(tokens[index++]);
			x = Number(tokens[index++]);
			y = Number(tokens[index++]);
			points.push([controlX, controlY], [x, y]);
		} else if (command === "Z") {
			subpaths.push(points);
			points = [];
		} else {
			throw new Error(`Unsupported SVG path command: ${command}`);
		}
	}

	if (points.length > 0) subpaths.push(points);

	return subpaths.map((subpath) => {
		const xs = subpath.map(([pointX]) => pointX);
		const ys = subpath.map(([, pointY]) => pointY);
		return {
			left: Math.min(...xs),
			top: Math.min(...ys),
			right: Math.max(...xs),
			bottom: Math.max(...ys),
		};
	});
}

describe("ThinkEx logo assets", () => {
	it.each(logoSources)("keeps every colored outline uniformly thick in $sourcePath", (logo) => {
		const { sourcePath, outlineColors: expectedColors } = logo;
		const source = readFileSync(resolve(process.cwd(), sourcePath), "utf8");
		const paths = [
			...source.matchAll(/<path[^>]*fill=["'](#[0-9A-F]{6})["'][^>]*d=["']([^"']+)/g),
		].filter(([, color]) => expectedColors.includes(color));

		expect(paths, `${sourcePath} must contain four outline paths`).toHaveLength(4);

		for (const [, , pathData] of paths) {
			const [outer, cutout] = pathBounds(pathData);
			expect(outer).toBeDefined();
			expect(cutout).toBeDefined();
			expect([
				cutout.left - outer.left,
				cutout.top - outer.top,
				outer.right - cutout.right,
				outer.bottom - cutout.bottom,
			]).toEqual([24, 24, 24, 24]);
		}
	});
});
