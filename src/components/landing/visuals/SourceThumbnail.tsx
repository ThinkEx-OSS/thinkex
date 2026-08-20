import { cn } from "#/lib/utils";

/**
 * Real scans, all public domain with no attribution required, verified against
 * their source records. Nothing here carries a licence obligation, which is
 * deliberate: a credit line is a lasting cost for an illegible thumbnail.
 *
 * - poster: US federal government work, 1950 (ERP / Economic Cooperation Admin)
 * - book: CRS report R45079 p.8, a US government work, public domain
 * - paper: CRS report R45079, a US government work, public domain
 * - lecture: Pexels License, free for commercial use, no attribution required
 *
 * Self-hosted rather than hotlinked, which is what Wikimedia asks for.
 */
export type SourceThumbnailKind = "book" | "paper" | "lecture" | "image";

/** Renders the cover, page or photo that stands for one source format. */
export function SourceThumbnail({
	className,
	kind,
}: {
	className?: string;
	kind: SourceThumbnailKind;
}) {
	return (
		<div className={cn("relative overflow-hidden rounded-sm bg-muted/50", className)}>
			{kind === "book" ? <BookCover /> : null}
			{kind === "paper" ? <PaperPage /> : null}
			{kind === "lecture" ? <LecturePhoto /> : null}
			{kind === "image" ? <Poster /> : null}
		</div>
	);
}

function BookCover() {
	return (
		<img
			src="/landing-sources/report-figure.webp"
			alt=""
			className="size-full object-cover object-top"
			width={560}
			height={419}
			loading="lazy"
			decoding="async"
		/>
	);
}

function PaperPage() {
	// Top-anchored so the masthead survives the crop; the body text below it is
	// texture at this size either way.
	return (
		<img
			src="/landing-sources/crs-marshall-plan.webp"
			alt=""
			className="size-full object-cover object-top"
			width={560}
			height={308}
			loading="lazy"
			decoding="async"
		/>
	);
}

function LecturePhoto() {
	return (
		<img
			src="/landing-sources/lecture-hall.webp"
			alt=""
			className="size-full object-cover"
			width={560}
			height={442}
			loading="lazy"
			decoding="async"
		/>
	);
}

function Poster() {
	return (
		<img
			src="/landing-sources/marshall-plan-poster.webp"
			alt=""
			className="size-full object-cover object-top"
			width={480}
			height={657}
			loading="lazy"
			decoding="async"
		/>
	);
}
