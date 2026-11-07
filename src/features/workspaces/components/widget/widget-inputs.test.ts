// @vitest-environment jsdom
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import inputScript from "./widget-inputs.js?raw";

it("captures form resets, scopes radio groups and restores dynamically mounted controls", async () => {
	const iframe = document.body.appendChild(document.createElement("iframe"));
	const frame = iframe.contentWindow as Window & typeof globalThis;
	const received = new Map<string, string>();
	let port!: MessagePort;
	const parent = {
		postMessage(_data: unknown, _target: string, ports: MessagePort[]) {
			port = ports[0]!;
			port.onmessage = ({ data }) => received.set(data.key, data.value);
		},
	};
	try {
		frame.document.body.innerHTML =
			'<form id="first"><input id="answer"><input id="a" type="radio" name="choice"></form><form id="second"><input id="b" type="radio" name="choice"></form>';
		runInNewContext(inputScript, {
			document: frame.document,
			parent,
			HTMLInputElement: frame.HTMLInputElement,
			Event: frame.Event,
			MutationObserver: frame.MutationObserver,
			MessageChannel,
			setTimeout,
			FRAME: "thinkex-widget-frame",
			SESSION: 1,
		});
		const input = (id: string) => frame.document.getElementById(id) as HTMLInputElement;
		input("answer").value = "remember";
		input("answer").dispatchEvent(new frame.Event("input", { bubbles: true }));
		input("a").click();
		input("b").click();
		await vi.waitFor(() => expect(received.size).toBe(3));
		(frame.document.getElementById("first") as HTMLFormElement).reset();
		await vi.waitFor(() => expect([...received.values()].sort()).toEqual(["", "", "id:b"]));
		port.postMessage([...received, ["text:id:late", "restored"]]);
		input("b").checked = false;
		await vi.waitFor(() => expect(input("b").checked).toBe(true));
		expect(input("a").checked).toBe(false);
		frame.document.body.insertAdjacentHTML("beforeend", '<input id="late">');
		await vi.waitFor(() => expect(input("late").value).toBe("restored"));
	} finally {
		port?.close();
		iframe.remove();
	}
});
