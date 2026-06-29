export function toArrayBuffer(bytes: Uint8Array) {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);

	return copy.buffer;
}

export async function sha256Base64Url(bytes: Uint8Array) {
	const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));

	return bytesToBase64Url(new Uint8Array(digest));
}

export async function sha256Base64UrlText(value: string) {
	return await sha256Base64Url(new TextEncoder().encode(value));
}

function bytesToBase64Url(bytes: Uint8Array) {
	const base64 = btoa(String.fromCharCode(...bytes));

	return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
