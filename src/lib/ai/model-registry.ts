export type ChatModelProvider = "Gemini" | "Claude" | "ChatGPT";

export type ChatModelConfig = {
  id: string;
  aliases?: string[];
  provider: ChatModelProvider;
  name: string;
  description: string;
  speed: string;
  costLevel: 1 | 2 | 3;
  strengths: string;
};

type ChatModelProviderGroup = {
  provider: ChatModelProvider;
  companyName: "GOOGLE" | "ANTHROPIC" | "OPENAI";
  models: ChatModelConfig[];
};

export const GOOGLE_MODEL_IDS = {
  GEMINI_3_1_PRO_PREVIEW: "gemini-3.1-pro-preview",
  GEMINI_3_FLASH_PREVIEW: "gemini-3-flash-preview",
  GEMINI_2_5_FLASH: "gemini-2.5-flash",
  GEMINI_2_5_FLASH_LITE: "gemini-2.5-flash-lite",
} as const;

export const CHAT_MODEL_PROVIDER_GROUPS: ChatModelProviderGroup[] = [
  {
    provider: "Gemini",
    companyName: "GOOGLE",
    models: [
      {
        id: `google/${GOOGLE_MODEL_IDS.GEMINI_3_1_PRO_PREVIEW}`,
        aliases: [GOOGLE_MODEL_IDS.GEMINI_3_1_PRO_PREVIEW],
        provider: "Gemini",
        name: "Gemini 3.1 Pro",
        description: "Higher-quality reasoning for complex work",
        speed: "Medium",
        costLevel: 3,
        strengths:
          "Complex reasoning, long-context work, and higher-quality structured output.",
      },
      {
        id: `google/${GOOGLE_MODEL_IDS.GEMINI_3_FLASH_PREVIEW}`,
        aliases: [GOOGLE_MODEL_IDS.GEMINI_3_FLASH_PREVIEW],
        provider: "Gemini",
        name: "Gemini 3.0 Flash",
        description: "Fast, lightweight model for everyday tasks",
        speed: "Fast",
        costLevel: 1,
        strengths:
          "Quick responses, lightweight drafting, and lower-cost chat workflows.",
      },
    ],
  },
  {
    provider: "Claude",
    companyName: "ANTHROPIC",
    models: [
      {
        id: "anthropic/claude-sonnet-4.6",
        aliases: ["claude-sonnet-4.6"],
        provider: "Claude",
        name: "Claude Sonnet 4.6",
        description: "Strong coding and general reasoning model",
        speed: "Medium",
        costLevel: 3,
        strengths:
          "Coding, complex workflows, and reliable multi-step reasoning.",
      },
      {
        id: "anthropic/claude-haiku-4.5",
        aliases: ["claude-haiku-4.5"],
        provider: "Claude",
        name: "Claude Haiku 4.5",
        description: "Fast, cheaper Claude model for simpler tasks",
        speed: "Very fast",
        costLevel: 1,
        strengths:
          "Fast drafting, simple transformations, and lower-cost day-to-day use.",
      },
    ],
  },
  {
    provider: "ChatGPT",
    companyName: "OPENAI",
    models: [
      {
        id: "openai/gpt-5-chat",
        aliases: ["gpt-5-chat"],
        provider: "ChatGPT",
        name: "GPT 5",
        description: "Balanced general-purpose chat and reasoning model",
        speed: "Medium-fast",
        costLevel: 2,
        strengths:
          "General chat, writing, and reasoning across a wide range of tasks.",
      },
    ],
  },
];

export const ALL_CHAT_MODELS: ChatModelConfig[] = CHAT_MODEL_PROVIDER_GROUPS.flatMap(
  (group) => group.models,
);

const CHAT_MODEL_BY_ID = new Map(
  ALL_CHAT_MODELS.map((model) => [model.id, model] as const),
);

const CHAT_MODEL_BY_ALIAS = new Map(
  ALL_CHAT_MODELS.flatMap((model) =>
    (model.aliases ?? []).map((alias) => [alias, model] as const),
  ),
);

export const DEFAULT_CHAT_MODEL_ID = `google/${GOOGLE_MODEL_IDS.GEMINI_3_FLASH_PREVIEW}`;

export function resolveChatModelConfig(modelId: string | null | undefined) {
  if (!modelId) return CHAT_MODEL_BY_ID.get(DEFAULT_CHAT_MODEL_ID)!;
  return (
    CHAT_MODEL_BY_ID.get(modelId) ??
    CHAT_MODEL_BY_ALIAS.get(modelId) ??
    CHAT_MODEL_BY_ID.get(DEFAULT_CHAT_MODEL_ID)!
  );
}

export function resolveChatGatewayModelId(modelId: string | null | undefined) {
  return resolveChatModelConfig(modelId).id;
}

export function getChatModelDisplayName(modelId: string | null | undefined) {
  return resolveChatModelConfig(modelId).name;
}

export function getChatGatewayOptions({
  modelId,
  userId,
}: {
  modelId: string;
  userId?: string | null;
}) {
  const options: {
    caching: "auto";
    models: string[];
    user?: string;
    order?: string[];
    only?: string[];
  } = {
    caching: "auto",
    models: [modelId],
  };

  if (userId) {
    options.user = userId;
  }

  // Prefer Bedrock first for Claude models, then fall back to Anthropic.
  if (modelId.startsWith("anthropic/")) {
    options.order = ["bedrock", "anthropic"];
    options.only = ["bedrock", "anthropic"];
  }

  return options;
}

export function getGoogleProviderOptionsForChat(modelId: string) {
  const options: {
    grounding: Record<string, never>;
    thinkingConfig: { includeThoughts: boolean; thinkingLevel?: "minimal" };
  } = {
    grounding: {
      // googleSearchRetrieval removed to force usage of explicit web_search tool
    },
    thinkingConfig: {
      includeThoughts: true,
    },
  };

  if (modelId === `google/${GOOGLE_MODEL_IDS.GEMINI_3_FLASH_PREVIEW}`) {
    options.thinkingConfig.thinkingLevel = "minimal";
  }

  return options;
}
