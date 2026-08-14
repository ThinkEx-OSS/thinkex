import { useState } from "react";

import { asRecord } from "#/lib/record";

const MAX_VISIBLE_IMAGES = 8;

export function AiChatImageSearchResults({ output }: { output: unknown }) {
	const images = getImageResults(output).slice(0, MAX_VISIBLE_IMAGES);
	if (images.length === 0) return null;

	return (
		<div className="grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3">
			{images.map((image) => (
				<ImageResultCard key={`${image.imageUrl}:${image.sourceUrl}`} image={image} />
			))}
		</div>
	);
}

function ImageResultCard({ image }: { image: ReturnType<typeof getImageResults>[number] }) {
	const [failed, setFailed] = useState(false);
	if (failed) return null;

	return (
		<a
			href={image.sourceUrl}
			target="_blank"
			rel="noreferrer"
			aria-label={image.title ?? `Image from ${getHostname(image.sourceUrl)}`}
			className="group/image aspect-[4/3] overflow-hidden rounded-lg border bg-muted outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring"
		>
			<img
				src={image.imageUrl}
				alt=""
				className="size-full object-cover transition-transform duration-200 group-hover/image:scale-[1.02]"
				loading="lazy"
				referrerPolicy="no-referrer"
				onError={() => setFailed(true)}
			/>
		</a>
	);
}

function getImageResults(output: unknown) {
	const results = asRecord(output).results;
	if (!Array.isArray(results)) return [];

	return results.flatMap((item) => {
		const record = asRecord(item);
		const imageUrl = getString(record.imageUrl);
		const sourceUrl = getString(record.url);
		if (record.type !== "image" || !imageUrl || !sourceUrl) return [];

		return [
			{
				imageUrl,
				sourceUrl,
				title: getString(record.title),
			},
		];
	});
}

function getString(value: unknown) {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getHostname(url: string) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "Image";
	}
}
