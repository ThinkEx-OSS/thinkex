export function escapeXml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

export function xmlTextElement(name: string, value: string) {
	return `<${name}>${escapeXml(value)}</${name}>`;
}
