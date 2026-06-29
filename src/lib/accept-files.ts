import { fileMatchesAccept } from "#/lib/file-accept";

export type AcceptFilesError = {
	code: "accept" | "max_file_size" | "max_files";
	message: string;
};

export type AcceptFilesOptions = {
	accept?: string;
	currentCount?: number;
	maxFileSize?: number;
	maxFiles?: number;
	onError?: (error: AcceptFilesError) => void;
};

export function acceptIncomingFiles(incoming: File[], options: AcceptFilesOptions = {}): File[] {
	if (incoming.length === 0) {
		return [];
	}

	const accepted = incoming.filter((file) => fileMatchesAccept(file, options.accept));
	if (accepted.length === 0) {
		options.onError?.({
			code: "accept",
			message: "No files match the accepted types.",
		});
		return [];
	}

	const sized = accepted.filter((file) =>
		options.maxFileSize ? file.size <= options.maxFileSize : true,
	);
	if (sized.length === 0) {
		options.onError?.({
			code: "max_file_size",
			message: "All files exceed the maximum size.",
		});
		return [];
	}

	const capacity =
		typeof options.maxFiles === "number"
			? Math.max(0, options.maxFiles - (options.currentCount ?? 0))
			: undefined;
	const capped = typeof capacity === "number" ? sized.slice(0, capacity) : sized;

	if (typeof capacity === "number" && sized.length > capacity) {
		options.onError?.({
			code: "max_files",
			message: "Too many files. Some were not added.",
		});
	}

	return capped;
}
