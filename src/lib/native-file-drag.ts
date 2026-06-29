export function hasNativeFiles(dataTransfer: DataTransfer) {
	return Array.from(dataTransfer.types).includes("Files");
}
