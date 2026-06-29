export function fileMatchesAccept(file: File, accept: string | undefined) {
	if (!accept?.trim()) {
		return true;
	}

	return accept
		.split(",")
		.flatMap((part) => {
			const pattern = part.trim();
			return pattern ? [pattern] : [];
		})
		.some((pattern) => {
			if (pattern.startsWith(".")) {
				return file.name.toLowerCase().endsWith(pattern.toLowerCase());
			}

			return pattern.endsWith("/*")
				? file.type.startsWith(pattern.slice(0, -1))
				: file.type === pattern;
		});
}
