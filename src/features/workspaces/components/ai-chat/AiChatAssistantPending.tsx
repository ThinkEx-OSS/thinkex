import { RefreshCw } from "lucide-react";

import { Bubble, BubbleContent } from "#/components/ui/bubble";
import { Marker, MarkerContent, MarkerIcon } from "#/components/ui/marker";
import { Message, MessageContent } from "#/components/ui/message";
import type { AssistantPendingKind } from "#/features/workspaces/components/ai-chat/ai-chat-display-state";

export function AiChatAssistantPending({ pending }: { pending: AssistantPendingKind }) {
	return (
		<Message>
			<MessageContent>
				<Bubble variant="ghost">
					<BubbleContent>
						<AiChatAssistantPendingBody pending={pending} />
					</BubbleContent>
				</Bubble>
			</MessageContent>
		</Message>
	);
}

function AiChatAssistantPendingBody({ pending }: { pending: AssistantPendingKind }) {
	if (pending === "recovering") {
		return (
			<Marker role="status" aria-live="polite">
				<MarkerIcon>
					<RefreshCw className="size-3.5 animate-spin" />
				</MarkerIcon>
				<MarkerContent className="shimmer ai-status-shimmer">
					{"Recovering response..."}
				</MarkerContent>
			</Marker>
		);
	}

	return <AiChatThinkingLoader />;
}

function AiChatThinkingLoader() {
	return (
		<Marker role="status" aria-live="polite" className="gap-2.5 py-2">
			<MarkerIcon className="size-[18px]">
				<ThinkExThinkingMark />
			</MarkerIcon>
			<MarkerContent className="shimmer ai-status-shimmer">Thinking...</MarkerContent>
		</Marker>
	);
}

export function ThinkExThinkingMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 512 512"
			className={
				className ?? "thinkex-thinking-mark size-[18px] shrink-0 self-center text-foreground"
			}
			aria-hidden="true"
		>
			<g className="thinkex-thinking-block" style={{ animationDelay: "0ms" }}>
				<rect fill="currentColor" width="139.636" height="139.636" rx="18.5818" />
			</g>
			<g className="thinkex-thinking-block" style={{ animationDelay: "95ms" }}>
				<rect fill="currentColor" x="186.182" width="139.636" height="116.364" rx="18.5818" />
			</g>
			<g className="thinkex-thinking-block" style={{ animationDelay: "215ms" }}>
				<rect fill="currentColor" x="372.364" width="139.636" height="139.636" rx="18.5818" />
			</g>
			<g className="thinkex-thinking-block" style={{ animationDelay: "355ms" }}>
				<path
					fill="#5C8BD6"
					fillRule="evenodd"
					d="M 387.9458 183.1820 H 493.4182 Q 512.0000 183.1820 512.0000 201.7638 V 356.7822 Q 512.0000 375.3640 493.4182 375.3640 H 387.9458 Q 369.3640 375.3640 369.3640 356.7822 V 201.7638 Q 369.3640 183.1820 387.9458 183.1820 Z M 398.8640 205.1820 Q 391.3640 205.1820 391.3640 212.6820 V 345.8640 Q 391.3640 353.3640 398.8640 353.3640 H 485.5000 Q 493.0000 353.3640 493.0000 345.8640 V 212.6820 Q 493.0000 205.1820 485.5000 205.1820 H 398.8640 Z"
				/>
			</g>
			<g className="thinkex-thinking-block" style={{ animationDelay: "520ms" }}>
				<path
					fill="#F7B53B"
					fillRule="evenodd"
					d="M 387.9458 415.9090 H 493.4182 Q 512.0000 415.9090 512.0000 434.4908 V 493.4182 Q 512.0000 512.0000 493.4182 512.0000 H 387.9458 Q 369.3640 512.0000 369.3640 493.4182 V 434.4908 Q 369.3640 415.9090 387.9458 415.9090 Z M 398.8640 437.9090 Q 391.3640 437.9090 391.3640 445.4090 V 485.4999 Q 391.3640 492.9999 398.8640 492.9999 H 485.5000 Q 493.0000 492.9999 493.0000 485.4999 V 445.4090 Q 493.0000 437.9090 485.5000 437.9090 H 398.8640 Z"
				/>
			</g>
			<g className="thinkex-thinking-block" style={{ animationDelay: "700ms" }}>
				<rect
					fill="currentColor"
					x="186.182"
					y="162.909"
					width="139.636"
					height="349.091"
					rx="18.5818"
				/>
			</g>
			<g className="thinkex-thinking-block" style={{ animationDelay: "905ms" }}>
				<path
					fill="#73BF7A"
					fillRule="evenodd"
					d="M 18.5818 322.8180 H 124.0542 Q 142.6360 322.8180 142.6360 341.3998 V 493.4182 Q 142.6360 512.0000 124.0542 512.0000 H 18.5818 Q 0.0000 512.0000 0.0000 493.4182 V 341.3998 Q 0.0000 322.8180 18.5818 322.8180 Z M 26.5000 344.8180 Q 19.0000 344.8180 19.0000 352.3180 V 485.5000 Q 19.0000 493.0000 26.5000 493.0000 H 113.1360 Q 120.6360 493.0000 120.6360 485.5000 V 352.3180 Q 120.6360 344.8180 113.1360 344.8180 H 26.5000 Z"
				/>
			</g>
			<g className="thinkex-thinking-block" style={{ animationDelay: "1140ms" }}>
				<path
					fill="#DA4944"
					fillRule="evenodd"
					d="M 18.5818 183.1820 H 124.0542 Q 142.6360 183.1820 142.6360 201.7638 V 263.6911 Q 142.6360 282.2729 124.0542 282.2729 H 18.5818 Q 0.0000 282.2729 0.0000 263.6911 V 201.7638 Q 0.0000 183.1820 18.5818 183.1820 Z M 26.5000 205.1820 Q 19.0000 205.1820 19.0000 212.6820 V 252.7729 Q 19.0000 260.2729 26.5000 260.2729 H 113.1360 Q 120.6360 260.2729 120.6360 252.7729 V 212.6820 Q 120.6360 205.1820 113.1360 205.1820 H 26.5000 Z"
				/>
			</g>
		</svg>
	);
}
