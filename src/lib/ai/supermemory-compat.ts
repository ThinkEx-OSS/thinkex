import { withSupermemory as originalWithSupermemory } from "@supermemory/tools/ai-sdk";
import type { LanguageModel as AiLanguageModel } from "ai";

type LanguageModel = Exclude<AiLanguageModel, string>;

/**
 * Wrapper around `withSupermemory` that fixes AI SDK 6 compatibility.
 *
 * `@supermemory/tools@1.4.1` uses object spread to wrap the model, which drops
 * non-enumerable / prototype properties (`specificationVersion`, `provider`,
 * `modelId`) that AI SDK 6 requires. This shim calls the original wrapper then
 * copies those properties back from the original model.
 *
 * Remove this once `@supermemory/tools` ships a fix.
 * Upstream issue: https://github.com/supermemoryai/supermemory-sdk/issues/XXX
 */
export function withSupermemory(
  model: LanguageModel,
  containerTag: string,
  options: Parameters<typeof originalWithSupermemory>[2],
): LanguageModel {
  const wrapped = originalWithSupermemory(
    model as any,
    containerTag,
    options,
  ) as any;

  const specProps = [
    "specificationVersion",
    "provider",
    "modelId",
    "defaultObjectGenerationMode",
    "supportsImageUrls",
    "supportsStructuredOutputs",
    "supportedUrls",
  ] as const;

  for (const prop of specProps) {
    if (wrapped[prop] === undefined && (model as any)[prop] !== undefined) {
      Object.defineProperty(wrapped, prop, {
        get: () => (model as any)[prop],
        enumerable: true,
        configurable: true,
      });
    }
  }

  return wrapped as LanguageModel;
}
