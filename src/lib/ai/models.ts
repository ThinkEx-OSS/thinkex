export type ModelProvider = "google" | "anthropic" | "openai";

export type ModelTier = "lite" | "fast" | "standard" | "pro";

/** AI Gateway provider routing (e.g. Bedrock before Anthropic API for Claude). */
export type GatewayRouting = {
  order: string[];
  only: string[];
};

export interface ModelDefinition {
  id: string;
  provider: ModelProvider;
  tier: ModelTier;
  /** Optional Gateway routing when multiple backends serve the same logical model. */
  gateway?: {
    routing?: GatewayRouting;
  };
  ui?: {
    providerLabel: string;
    displayName: string;
    description: string;
    speed: string;
    costLevel: 1 | 2 | 3;
    strengths: string;
  };
}

export type ModelPurpose =
  | "default-chat"
  | "web-search"
  | "title-generation"
  | "autogen-search"
  | "autogen-distill"
  | "autogen-content"
  | "audio-transcribe"
  | "escalation";

const PROVIDER_PREFIX_RE = /^(google|anthropic|openai)\//;

export const MODEL_REGISTRY: Record<string, ModelDefinition> = {
  "gemini-3.1-pro-preview": {
    id: "gemini-3.1-pro-preview",
    provider: "google",
    tier: "pro",
    ui: {
      providerLabel: "Gemini",
      displayName: "Gemini 3.1 Pro",
      description: "Higher-quality reasoning for complex work",
      speed: "Medium",
      costLevel: 3,
      strengths:
        "Complex reasoning, long-context work, and higher-quality structured output.",
    },
  },
  "gemini-3-flash-preview": {
    id: "gemini-3-flash-preview",
    provider: "google",
    tier: "fast",
    ui: {
      providerLabel: "Gemini",
      displayName: "Gemini 3.0 Flash",
      description: "Fast, lightweight model for everyday tasks",
      speed: "Fast",
      costLevel: 1,
      strengths:
        "Quick responses, lightweight drafting, and lower-cost chat workflows.",
    },
  },
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    provider: "google",
    tier: "fast",
  },
  "gemini-2.5-flash-lite": {
    id: "gemini-2.5-flash-lite",
    provider: "google",
    tier: "lite",
  },
  "claude-sonnet-4.6": {
    id: "claude-sonnet-4.6",
    provider: "anthropic",
    tier: "pro",
    gateway: {
      routing: {
        order: ["bedrock", "anthropic"],
        only: ["bedrock", "anthropic"],
      },
    },
    ui: {
      providerLabel: "Claude",
      displayName: "Claude Sonnet 4.6",
      description: "Strong coding and general reasoning model",
      speed: "Medium",
      costLevel: 3,
      strengths:
        "Coding, complex workflows, and reliable multi-step reasoning.",
    },
  },
  "claude-haiku-4.5": {
    id: "claude-haiku-4.5",
    provider: "anthropic",
    tier: "fast",
    gateway: {
      routing: {
        order: ["bedrock", "anthropic"],
        only: ["bedrock", "anthropic"],
      },
    },
    ui: {
      providerLabel: "Claude",
      displayName: "Claude Haiku 4.5",
      description: "Fast, cheaper Claude model for simpler tasks",
      speed: "Very fast",
      costLevel: 1,
      strengths:
        "Fast drafting, simple transformations, and lower-cost day-to-day use.",
    },
  },
  "gpt-5-chat": {
    id: "gpt-5-chat",
    provider: "openai",
    tier: "standard",
    ui: {
      providerLabel: "ChatGPT",
      displayName: "GPT 5",
      description: "Balanced general-purpose chat and reasoning model",
      speed: "Medium-fast",
      costLevel: 2,
      strengths:
        "General chat, writing, and reasoning across a wide range of tasks.",
    },
  },
};

const PURPOSE_MODEL_MAP: Record<ModelPurpose, string> = {
  "default-chat": "gemini-3-flash-preview",
  "web-search": "gemini-2.5-flash-lite",
  "title-generation": "gemini-2.5-flash-lite",
  "autogen-search": "gemini-2.5-flash-lite",
  "autogen-distill": "gemini-2.5-flash-lite",
  "autogen-content": "gemini-2.5-flash",
  "audio-transcribe": "gemini-2.5-flash",
  escalation: "gemini-3.1-pro-preview",
};

export function getModelForPurpose(purpose: ModelPurpose): string {
  return PURPOSE_MODEL_MAP[purpose];
}

/** Resolved `provider/model` id for Vercel AI Gateway + `getModelForPurpose`. */
export function getGatewayModelIdForPurpose(purpose: ModelPurpose): string {
  return resolveGatewayModelId(getModelForPurpose(purpose));
}

export function getModelDefinition(id: string): ModelDefinition | undefined {
  const raw = id.replace(PROVIDER_PREFIX_RE, "");
  return MODEL_REGISTRY[raw];
}

export function resolveGatewayModelId(input: string): string {
  if (PROVIDER_PREFIX_RE.test(input)) return input;

  const raw = input.replace(PROVIDER_PREFIX_RE, "");
  const def = MODEL_REGISTRY[raw];
  if (def) return `${def.provider}/${raw}`;

  if (raw.startsWith("gemini-")) return `google/${raw}`;
  if (raw.includes("claude")) return `anthropic/${raw}`;
  return input;
}

export function getDefaultChatModelId(): string {
  return PURPOSE_MODEL_MAP["default-chat"];
}

export function getChatSelectableModels(): Array<{
  providerLabel: string;
  models: (ModelDefinition & { ui: NonNullable<ModelDefinition["ui"]> })[];
}> {
  const groups = new Map<
    string,
    (ModelDefinition & { ui: NonNullable<ModelDefinition["ui"]> })[]
  >();

  for (const model of Object.values(MODEL_REGISTRY)) {
    if (!model.ui) continue;
    const { providerLabel } = model.ui;
    if (!groups.has(providerLabel)) groups.set(providerLabel, []);
    groups
      .get(providerLabel)!
      .push(
        model as ModelDefinition & { ui: NonNullable<ModelDefinition["ui"]> },
      );
  }

  return Array.from(groups.entries()).map(([providerLabel, models]) => ({
    providerLabel,
    models,
  }));
}
