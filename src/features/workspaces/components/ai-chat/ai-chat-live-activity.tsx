import { createContext, useContext, type ReactNode } from "react";

import type { AiCodemodeActivityEvent } from "#/features/workspaces/ai/codemode-tool";
import { asRecord } from "#/lib/record";

/**
 * Latest live progress event per orchestrate tool call, keyed by the outer
 * call's id. Delivered as transient `data-codemode-activity` stream parts, so
 * it exists only during the streaming turn — settled parts carry their own
 * durable `calls` record instead.
 */
export type AiChatLiveCodemodeActivity = Readonly<Record<string, AiCodemodeActivityEvent>>;

const AiChatLiveActivityContext = createContext<AiChatLiveCodemodeActivity>({});

/** Provides the live orchestrate progress map to the message tree. */
export function AiChatLiveActivityProvider({
	children,
	value,
}: {
	children: ReactNode;
	value: AiChatLiveCodemodeActivity;
}) {
	return (
		<AiChatLiveActivityContext.Provider value={value}>
			{children}
		</AiChatLiveActivityContext.Provider>
	);
}

/**
 * The latest live event for one orchestrate call, or undefined outside a
 * streaming turn.
 */
export function useLiveCodemodeActivity(invocationId: string): AiCodemodeActivityEvent | undefined {
	return useContext(AiChatLiveActivityContext)[invocationId];
}

const CALL_STATUSES = new Set(["running", "completed", "failed"]);

/**
 * Parse a `data-codemode-activity` part's payload from the untrusted stream.
 *
 * @returns The event, or null when the payload does not match the shape.
 */
export function parseCodemodeActivityEvent(data: unknown): AiCodemodeActivityEvent | null {
	const record = asRecord(data);
	const call = asRecord(record.call);

	if (
		typeof record.invocationId !== "string" ||
		typeof record.title !== "string" ||
		typeof call.index !== "number" ||
		typeof call.toolName !== "string" ||
		typeof call.status !== "string" ||
		!CALL_STATUSES.has(call.status)
	) {
		return null;
	}

	return {
		invocationId: record.invocationId,
		title: record.title,
		call: {
			index: call.index,
			toolName: call.toolName,
			// SAFETY: membership in CALL_STATUSES was checked above; TypeScript
			// cannot narrow a string through Set.has.
			status: call.status as AiCodemodeActivityEvent["call"]["status"],
		},
	};
}
