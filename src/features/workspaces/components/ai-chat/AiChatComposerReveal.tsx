import { LazyMotion, domAnimation, m } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";

const revealTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

// The one way composer header rows (context bar, edit banner, allowance
// notice, …) appear and disappear: the wrapper animates to the measured
// height of whatever is rendered inside — nothing → 0 — so notices slide in
// and out instead of snapping the composer taller. Children control their own
// visibility by rendering null; include any top padding inside the child so
// it collapses with the content.
export default function AiChatComposerReveal({ children }: { children: ReactNode }) {
	const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);
	const [height, setHeight] = useState<number | "auto">("auto");

	useEffect(() => {
		if (!contentNode) {
			return;
		}

		const updateHeight = () => {
			setHeight(contentNode.getBoundingClientRect().height);
		};

		updateHeight();
		const observer = new ResizeObserver(updateHeight);
		observer.observe(contentNode);
		return () => observer.disconnect();
	}, [contentNode]);

	return (
		<LazyMotion features={domAnimation}>
			<m.div
				animate={{ height }}
				className="w-full min-w-0 overflow-hidden"
				initial={false}
				transition={revealTransition}
			>
				<div ref={setContentNode} className="w-full min-w-0">
					{children}
				</div>
			</m.div>
		</LazyMotion>
	);
}
