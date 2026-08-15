import type { ReactNode } from "react";
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

function ThinkExThinkingMark() {
	return (
		<svg
			viewBox="0 0 512 512"
			className="thinkex-thinking-mark size-[18px] shrink-0 self-center text-foreground"
			aria-hidden="true"
		>
			<ThinkExThinkingBlock name="top-left">
				<rect fill="currentColor" width="139.636" height="139.636" rx="18.5818" />
			</ThinkExThinkingBlock>
			<ThinkExThinkingBlock name="top-middle">
				<rect fill="currentColor" x="186.182" width="139.636" height="116.364" rx="18.5818" />
			</ThinkExThinkingBlock>
			<ThinkExThinkingBlock name="top-right">
				<rect fill="currentColor" x="372.364" width="139.636" height="139.636" rx="18.5818" />
			</ThinkExThinkingBlock>
			<ThinkExThinkingBlock name="right-middle">
				<path
					fill="#5C8BD6"
					fillRule="evenodd"
					d="M 390.9458 186.1820 H 493.4182 Q 512.0000 186.1820 512.0000 204.7638 V 353.7822 Q 512.0000 372.3640 493.4182 372.3640 H 390.9458 Q 372.3640 372.3640 372.3640 353.7822 V 204.7638 Q 372.3640 186.1820 390.9458 186.1820 Z M 403.8640 210.1820 Q 396.3640 210.1820 396.3640 217.6820 V 340.8640 Q 396.3640 348.3640 403.8640 348.3640 H 480.5000 Q 488.0000 348.3640 488.0000 340.8640 V 217.6820 Q 488.0000 210.1820 480.5000 210.1820 H 403.8640 Z"
				/>
			</ThinkExThinkingBlock>
			<ThinkExThinkingBlock name="bottom-right">
				<path
					fill="#F7B53B"
					fillRule="evenodd"
					d="M 390.9458 418.9090 H 493.4182 Q 512.0000 418.9090 512.0000 437.4908 V 493.4182 Q 512.0000 512.0000 493.4182 512.0000 H 390.9458 Q 372.3640 512.0000 372.3640 493.4182 V 437.4908 Q 372.3640 418.9090 390.9458 418.9090 Z M 403.8640 442.9090 Q 396.3640 442.9090 396.3640 450.4090 V 480.5000 Q 396.3640 488.0000 403.8640 488.0000 H 480.5000 Q 488.0000 488.0000 488.0000 480.5000 V 450.4090 Q 488.0000 442.9090 480.5000 442.9090 H 403.8640 Z"
				/>
			</ThinkExThinkingBlock>
			<ThinkExThinkingBlock name="center">
				<rect
					fill="currentColor"
					x="186.182"
					y="162.909"
					width="139.636"
					height="349.091"
					rx="18.5818"
				/>
			</ThinkExThinkingBlock>
			<ThinkExThinkingBlock name="bottom-left">
				<path
					fill="#73BF7A"
					fillRule="evenodd"
					d="M 18.5818 325.8180 H 121.0542 Q 139.6360 325.8180 139.6360 344.3998 V 493.4182 Q 139.6360 512.0000 121.0542 512.0000 H 18.5818 Q 0.0000 512.0000 0.0000 493.4182 V 344.3998 Q 0.0000 325.8180 18.5818 325.8180 Z M 31.5000 349.8180 Q 24.0000 349.8180 24.0000 357.3180 V 480.5000 Q 24.0000 488.0000 29.5000 488.0000 H 108.1360 Q 115.6360 488.0000 115.6360 480.5000 V 357.3180 Q 115.6360 349.8180 108.1360 349.8180 H 29.5000 Z"
				/>
			</ThinkExThinkingBlock>
			<ThinkExThinkingBlock name="red-left">
				<path
					fill="#DA4944"
					fillRule="evenodd"
					d="M 18.5818 186.1820 H 121.0542 Q 139.6360 186.1820 139.6360 204.7638 V 260.6911 Q 139.6360 279.2729 121.0542 279.2729 H 18.5818 Q 0.0000 279.2729 0.0000 260.6911 V 204.7638 Q 0.0000 186.1820 18.5818 186.1820 Z M 31.5000 210.1820 Q 24.0000 210.1820 24.0000 217.6820 V 247.7729 Q 24.0000 255.2729 29.5000 255.2729 H 108.1360 Q 115.6360 255.2729 115.6360 247.7729 V 217.6820 Q 115.6360 210.1820 108.1360 210.1820 H 29.5000 Z"
				/>
			</ThinkExThinkingBlock>
		</svg>
	);
}

type ThinkExThinkingBlockName =
	| "top-left"
	| "top-middle"
	| "top-right"
	| "right-middle"
	| "bottom-right"
	| "center"
	| "bottom-left"
	| "red-left";

function ThinkExThinkingBlock({
	children,
	name,
}: {
	children: ReactNode;
	name: ThinkExThinkingBlockName;
}) {
	return <g className={`thinkex-thinking-block thinkex-thinking-block--${name}`}>{children}</g>;
}
