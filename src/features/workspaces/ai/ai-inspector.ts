export const AI_INSPECTOR_MAX_EVENTS = 300;

export type AIInspectorEventType =
	| "turn.started"
	| "step.started"
	| "chunk"
	| "tool.started"
	| "tool.finished"
	| "step.finished"
	| "turn.finished"
	| "turn.error";

export interface AIInspectorEvent {
	id: string;
	runId: string;
	sequence: number;
	type: AIInspectorEventType;
	createdAt: number;
	payload: unknown;
}

export interface AIInspectorSnapshot {
	isEnabled: boolean;
	threadId: string;
	events: AIInspectorEvent[];
}

export interface AIInspectorEventRow {
	id: string;
	run_id: string;
	sequence: number;
	type: string;
	payload_json: string;
	created_at: number;
}

export function isAIInspectorEnabled() {
	return import.meta.env.DEV;
}

export function mapAIInspectorEventRow(row: AIInspectorEventRow): AIInspectorEvent {
	return {
		id: row.id,
		runId: row.run_id,
		sequence: row.sequence,
		type: normalizeAIInspectorEventType(row.type),
		createdAt: row.created_at,
		payload: parseInspectorPayload(row.payload_json),
	};
}

function normalizeAIInspectorEventType(type: string): AIInspectorEventType {
	switch (type) {
		case "turn.started":
		case "step.started":
		case "chunk":
		case "tool.started":
		case "tool.finished":
		case "step.finished":
		case "turn.finished":
		case "turn.error":
			return type;
		default:
			return "chunk";
	}
}

function parseInspectorPayload(payloadJson: string) {
	try {
		return JSON.parse(payloadJson) as unknown;
	} catch {
		return { parseError: true, raw: payloadJson };
	}
}
