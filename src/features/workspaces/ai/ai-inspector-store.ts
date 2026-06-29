import { nanoid } from "nanoid";

import {
	AI_INSPECTOR_MAX_EVENTS,
	type AIInspectorEventRow,
	type AIInspectorEventType,
	type AIInspectorSnapshot,
	isAIInspectorEnabled,
	mapAIInspectorEventRow,
} from "#/features/workspaces/ai/ai-inspector";
import { serializeInspectorPayload } from "#/features/workspaces/ai/ai-inspector-serialization";

interface AIInspectorSqlHost {
	sql<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): T[];
}

export interface AIInspectorRecorderState {
	hasSchema: boolean;
	runId: string | null;
	sequence: number;
}

export function createAIInspectorRecorderState(): AIInspectorRecorderState {
	return {
		hasSchema: false,
		runId: null,
		sequence: 0,
	};
}

export function beginAIInspectorRun(state: AIInspectorRecorderState) {
	if (!isAIInspectorEnabled()) {
		return;
	}

	state.runId = nanoid(12);
	state.sequence = 0;
}

export function recordAIInspectorEvent(
	host: AIInspectorSqlHost,
	state: AIInspectorRecorderState,
	type: AIInspectorEventType,
	payload: unknown,
) {
	if (!isAIInspectorEnabled()) {
		return;
	}

	ensureAIInspectorSchema(host, state);

	const runId = state.runId ?? "startup";
	const sequence = state.sequence;
	state.sequence += 1;

	host.sql`
		INSERT INTO ai_inspector_events (
			id,
			run_id,
			sequence,
			type,
			payload_json,
			created_at
		)
		VALUES (
			${nanoid(16)},
			${runId},
			${sequence},
			${type},
			${serializeInspectorPayload(payload)},
			${Date.now()}
		)
	`;
	host.sql`
		DELETE FROM ai_inspector_events
		WHERE id IN (
			SELECT id
			FROM ai_inspector_events
			ORDER BY created_at DESC, sequence DESC
			LIMIT -1 OFFSET ${AI_INSPECTOR_MAX_EVENTS}
		)
	`;
}

export function getAIInspectorSnapshot(
	host: AIInspectorSqlHost,
	state: AIInspectorRecorderState,
	threadId: string,
): AIInspectorSnapshot {
	if (!isAIInspectorEnabled()) {
		return { isEnabled: false, threadId, events: [] };
	}

	ensureAIInspectorSchema(host, state);

	const events = host.sql<AIInspectorEventRow>`
		SELECT id, run_id, sequence, type, payload_json, created_at
		FROM ai_inspector_events
		ORDER BY created_at DESC, sequence DESC
		LIMIT ${AI_INSPECTOR_MAX_EVENTS}
	`
		.map(mapAIInspectorEventRow)
		.reverse();

	return { isEnabled: true, threadId, events };
}

function ensureAIInspectorSchema(host: AIInspectorSqlHost, state: AIInspectorRecorderState) {
	if (state.hasSchema) {
		return;
	}

	host.sql`CREATE TABLE IF NOT EXISTS ai_inspector_events (
		id TEXT PRIMARY KEY,
		run_id TEXT NOT NULL,
		sequence INTEGER NOT NULL,
		type TEXT NOT NULL,
		payload_json TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)`;
	host.sql`CREATE INDEX IF NOT EXISTS ai_inspector_events_recent_idx
		ON ai_inspector_events (created_at, sequence)`;
	state.hasSchema = true;
}
