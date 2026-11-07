// Runs inside the opaque-origin iframe. The transferred port stays bound to this
// document even if authored code navigates the frame to a different origin.
{
	const { port1, port2 } = new MessageChannel();
	const saved = new Map();
	const notified = new Map();
	const selector = "textarea,select,input";
	let restoring = false;

	function keyFor(control, index) {
		if (
			control instanceof HTMLInputElement &&
			!["text", "search", "number", "range", "checkbox", "radio", "color", "date", "time"].includes(
				control.type,
			)
		)
			return null;
		if (control.type === "radio" && control.name) {
			const form = control.form;
			const owner = form?.id
				? "id:" + form.id
				: "index:" + Array.from(document.forms).indexOf(form);
			return "radio:" + JSON.stringify([owner, control.name]);
		}
		return control.type + ":" + (control.id ? "id:" + control.id : "index:" + index);
	}

	function valueOf(control, index) {
		if (control.type === "radio")
			return control.checked ? (control.id ? "id:" + control.id : "index:" + index) : "";
		if (control.type === "checkbox") return String(control.checked);
		if (control.type === "select-multiple")
			return JSON.stringify(Array.from(control.selectedOptions, (option) => option.value));
		return control.value;
	}

	function capture(event) {
		const control = event.target;
		if (restoring || !control.matches?.(selector) || (control.type === "radio" && !control.checked))
			return;
		const index = Array.from(document.querySelectorAll(selector)).indexOf(control);
		const key = keyFor(control, index);
		save(key, valueOf(control, index));
	}

	function save(key, value) {
		if (!key || key.length > 200 || value.length > 8192 || saved.get(key) === value) return;
		saved.set(key, value);
		notified.set(key, value);
		port1.postMessage({ key, value });
	}

	function restore() {
		restoring = true;
		try {
			document.querySelectorAll(selector).forEach((control, index) => {
				const key = keyFor(control, index);
				if (!saved.has(key)) return;
				const value = saved.get(key);
				if (control.type === "radio") {
					const option = control.id ? "id:" + control.id : "index:" + index;
					if (value && value !== option) return;
					const checked = value === option;
					if (checked === control.checked) return;
					control.checked = checked;
				} else if (valueOf(control) === value) return;
				else if (control.type === "checkbox") control.checked = value === "true";
				else if (control.type === "select-multiple") {
					let values;
					try {
						values = JSON.parse(value);
					} catch {
						return;
					}
					if (!Array.isArray(values)) return;
					const selected = new Set(values);
					for (const option of control.options) option.selected = selected.has(option.value);
				} else control.value = value;
				// A widget can rebuild its controls in its input handler. Restore the
				// replacement without triggering that same render indefinitely.
				if (notified.get(key) === value) return;
				notified.set(key, value);
				control.dispatchEvent(new Event("input", { bubbles: true }));
				control.dispatchEvent(new Event("change", { bubbles: true }));
			});
		} finally {
			restoring = false;
		}
	}
	port1.onmessage = ({ data }) => {
		for (const [key, value] of data) {
			if (typeof value === "string") saved.set(key, value);
			else {
				saved.delete(key);
				notified.delete(key);
			}
		}
		restore();
	};
	document.addEventListener("input", capture, true);
	document.addEventListener("change", capture, true);
	document.addEventListener(
		"reset",
		(event) => {
			const form = event.target;
			// Reset fires before native controls receive their defaults.
			setTimeout(() => {
				if (event.defaultPrevented) return;
				const defaults = new Map();
				document.querySelectorAll(selector).forEach((control, index) => {
					if (control.form !== form) return;
					const key = keyFor(control, index);
					if (!key || (control.type === "radio" && !control.checked && defaults.has(key))) return;
					defaults.set(key, valueOf(control, index));
				});
				for (const [key, value] of defaults) save(key, value);
			}, 0);
		},
		true,
	);
	new MutationObserver((records) => {
		if (
			records.some((record) =>
				Array.from(record.addedNodes).some(
					(node) => node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector)),
				),
			)
		)
			restore();
	}).observe(document.body, { subtree: true, childList: true });
	parent.postMessage({ source: FRAME, sessionId: SESSION, kind: "connect-inputs" }, "*", [port2]);
}
