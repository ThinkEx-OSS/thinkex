export class WorkspaceFileConversionError extends Error {
	readonly userMessage: string;

	constructor(message: string, userMessage: string) {
		super(message);
		this.name = "WorkspaceFileConversionError";
		this.userMessage = userMessage;
	}
}
