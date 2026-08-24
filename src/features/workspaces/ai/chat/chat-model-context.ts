import { convertToModelMessages, type UIMessage } from "ai";

/**
 * Converts durable UI history into provider-neutral model context.
 *
 * Gateway fallbacks may change provider, account, or region between turns, so
 * persisted provider item references are never safe to replay. Hidden
 * reasoning is also provider-specific and is not conversation content.
 */
export function convertPersistedMessagesToModelMessages(messages: UIMessage[]) {
	return convertToModelMessages(
		messages.map((message) => ({
			...message,
			parts: message.parts.flatMap(toPortableParts),
		})),
		{ ignoreIncompleteToolCalls: true },
	);
}

function toPortableParts(part: UIMessage["parts"][number]): UIMessage["parts"] {
	if (part.type === "reasoning" || part.type === "reasoning-file" || part.type === "custom") {
		return [];
	}

	if (part.type === "file") {
		const {
			providerMetadata: _providerMetadata,
			providerReference: _providerReference,
			...portable
		} = part;
		return [portable];
	}

	if ("callProviderMetadata" in part) {
		const { callProviderMetadata: _callProviderMetadata, ...withoutCallMetadata } = part;

		if ("resultProviderMetadata" in withoutCallMetadata) {
			const { resultProviderMetadata: _resultProviderMetadata, ...portable } = withoutCallMetadata;
			return [portable];
		}

		return [withoutCallMetadata];
	}

	if ("resultProviderMetadata" in part) {
		const { resultProviderMetadata: _resultProviderMetadata, ...portable } = part;
		return [portable];
	}

	if ("providerMetadata" in part) {
		const { providerMetadata: _providerMetadata, ...portable } = part;
		return [portable];
	}

	return [part];
}
