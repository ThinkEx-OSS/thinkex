export function AiChatComputeImages({ output }: { output: unknown }) {
	const images = getArray(asRecord(output).results).flatMap(getComputeResultImages);

	if (images.length === 0) {
		return null;
	}

	return (
		<div className="space-y-2">
			{images.map((image) => (
				<img
					alt={image.alt}
					className="max-h-[420px] max-w-full rounded-md border bg-background object-contain"
					key={image.src.slice(0, 80)}
					src={image.src}
				/>
			))}
		</div>
	);
}

export function AiChatComputeDetails({ output }: { output: unknown }) {
	const record = asRecord(output);
	const error = asRecord(record.error);
	const logs = asRecord(record.logs);
	const stdout = getStringArray(logs.stdout);
	const stderr = getStringArray(logs.stderr);

	return (
		<div className="space-y-3 text-sm">
			{error.message ? (
				<ComputeTextBlock tone="error" title={getString(error.name) ?? "Error"}>
					{getString(error.message)}
				</ComputeTextBlock>
			) : null}
			{getArray(record.results).map((result, index) => (
				<ComputeResultDetails key={index} result={result} />
			))}
			{stdout.length > 0 ? (
				<ComputeTextBlock title="Stdout">{stdout.join("\n")}</ComputeTextBlock>
			) : null}
			{stderr.length > 0 ? (
				<ComputeTextBlock tone="error" title="Stderr">
					{stderr.join("\n")}
				</ComputeTextBlock>
			) : null}
		</div>
	);
}

function ComputeResultDetails({ result }: { result: unknown }) {
	const item = asRecord(result);
	const text = getFirstString(
		item.text,
		item.markdown,
		item.latex,
		item.svg,
		item.html,
		item.javascript,
	);
	const structured = getStructuredPreview(item.json, item.chart, item.data);

	if (text) {
		return <ComputeTextBlock title="Result">{text}</ComputeTextBlock>;
	}

	return structured ? <ComputeTextBlock title="Result">{structured}</ComputeTextBlock> : null;
}

function getComputeResultImages(result: unknown) {
	const item = asRecord(result);
	const png = getString(item.png);
	const jpeg = getString(item.jpeg);

	return [
		png ? { alt: "Compute result", src: `data:image/png;base64,${png}` } : null,
		jpeg ? { alt: "Compute result", src: `data:image/jpeg;base64,${jpeg}` } : null,
	].filter((image): image is { alt: string; src: string } => image !== null);
}

function ComputeTextBlock({
	children,
	title,
	tone = "default",
}: {
	children: string | undefined;
	title: string;
	tone?: "default" | "error";
}) {
	if (!children) {
		return null;
	}

	return (
		<div className="max-w-full overflow-hidden rounded-md border bg-muted/20">
			<div className="border-b px-3 py-1.5 font-medium text-muted-foreground text-xs">{title}</div>
			<pre
				className={
					tone === "error"
						? "max-h-80 overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-destructive"
						: "max-h-80 overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-muted-foreground"
				}
			>
				{children}
			</pre>
		</div>
	);
}

function getFirstString(...values: unknown[]) {
	return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function getStructuredPreview(...values: unknown[]) {
	const value = values.find((candidate) => candidate !== undefined);

	if (value === undefined) {
		return undefined;
	}

	return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function getString(value: unknown) {
	return typeof value === "string" ? value : undefined;
}

function getStringArray(value: unknown) {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}
