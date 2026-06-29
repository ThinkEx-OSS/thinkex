export function readFileAsDataUrl(file: File | Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
				return;
			}

			reject(new Error("Could not read file data."));
		};
		reader.onerror = () => {
			reject(new Error("Could not read file data."));
		};
		reader.readAsDataURL(file);
	});
}
