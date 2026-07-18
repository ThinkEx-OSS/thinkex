const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function toArrayBuffer(bytes: Uint8Array) {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
}

export function encodeBase64Url(bytes: Uint8Array) {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeBase64Url(value: string) {
	const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
	return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export function encodeBase64UrlText(value: string) {
	return encodeBase64Url(textEncoder.encode(value));
}

export function decodeBase64UrlText(value: string) {
	return textDecoder.decode(decodeBase64Url(value));
}

export async function sha256Base64Url(bytes: Uint8Array) {
	const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
	return encodeBase64Url(new Uint8Array(digest));
}

export async function sha256Base64UrlText(value: string) {
	return sha256Base64Url(textEncoder.encode(value));
}
