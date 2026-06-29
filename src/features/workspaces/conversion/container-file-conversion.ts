type FileConversionContainer = {
	fetch(request: Request): Promise<Response>;
	startAndWaitForPorts(input: {
		cancellationOptions: { portReadyTimeoutMS: number };
	}): Promise<void>;
};

export async function convertFileWithContainer(input: {
	container: FileConversionContainer;
	emptyMessage: string;
	error: (message: string) => Error;
	file: File;
	fileName: string;
	formFieldName: string;
	url: string;
}): Promise<ArrayBuffer> {
	await input.container.startAndWaitForPorts({
		cancellationOptions: {
			portReadyTimeoutMS: 60_000,
		},
	});

	const formData = new FormData();
	formData.set(input.formFieldName, input.file, input.fileName);

	const response = await input.container.fetch(
		new Request(input.url, {
			body: formData,
			method: "POST",
		}),
	);

	if (!response.ok) {
		throw input.error(await getConversionErrorMessage(response));
	}

	const bytes = await response.arrayBuffer();

	if (bytes.byteLength === 0) {
		throw input.error(input.emptyMessage);
	}

	return bytes;
}

async function getConversionErrorMessage(response: Response) {
	const fallback = `File conversion failed with status ${response.status}.`;
	const body = await response.text().catch(() => "");
	const message = body.trim();

	return message ? `${fallback} ${message}` : fallback;
}
