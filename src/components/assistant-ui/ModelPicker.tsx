import { useMemo, useState } from "react";
import NextImage from "next/image";
import { FaCheck } from "react-icons/fa6";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useUIStore } from "@/lib/stores/ui-store";
import { focusComposerInput } from "@/lib/utils/composer-utils";
import { cn } from "@/lib/utils";

const MODEL_LOGO_PATHS = {
  Gemini: "/model-logos/gemini.svg",
  Claude: "/model-logos/claude.svg",
  ChatGPT: "/model-logos/chatgpt.svg",
} as const;

const PROVIDER_COMPANY_NAMES = {
  Gemini: "GOOGLE",
  Claude: "ANTHROPIC",
  ChatGPT: "OPENAI",
} as const;

type ModelProvider = keyof typeof MODEL_LOGO_PATHS;

type ModelConfig = {
  id: string;
  name: string;
  description: string;
  speed: string;
  costLevel: number;
  strengths: string;
};

function ModelProviderIcon({
  provider,
  className,
}: {
  provider: ModelProvider;
  className?: string;
}) {
  return (
    <NextImage
      src={MODEL_LOGO_PATHS[provider]}
      alt={`${provider} logo`}
      width={14}
      height={14}
      className={cn(
        "size-3.5 rounded-[3px] object-contain",
        provider === "ChatGPT" && "dark:invert",
        className,
      )}
    />
  );
}

function ModelDropdownItem({
  provider,
  model,
  isSelected,
  isHoverOpen,
  onHoverOpenChange,
  onSelect,
}: {
  provider: ModelProvider;
  model: ModelConfig;
  isSelected: boolean;
  isHoverOpen: boolean;
  onHoverOpenChange: (open: boolean) => void;
  onSelect: () => void;
}) {
  return (
    <HoverCard
      open={isHoverOpen}
      onOpenChange={onHoverOpenChange}
      openDelay={120}
      closeDelay={0}
    >
      <HoverCardTrigger asChild>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onSelect();
          }}
          aria-label={model.description ?? model.name}
          className={cn(
            "min-h-8 cursor-pointer px-2 py-1",
            isSelected && "bg-accent/50",
          )}
        >
          <div className="flex w-full items-center gap-2">
            <ModelProviderIcon provider={provider} />
            <div className="min-w-0 flex-1 truncate text-sm text-foreground">
              {model.name}
            </div>
            <div className="flex size-3 shrink-0 items-center justify-center">
              {isSelected ? (
                <FaCheck className="size-3 text-sidebar-foreground/80" />
              ) : null}
            </div>
          </div>
        </DropdownMenuItem>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="right"
        sideOffset={8}
        collisionPadding={12}
        className="w-72 p-3"
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ModelProviderIcon provider={provider} className="size-4" />
              <div className="text-sm font-medium text-foreground">
                {model.name}
              </div>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {model.description}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border bg-muted/40 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Speed
              </div>
              <div className="mt-1 font-medium text-foreground">
                {model.speed}
              </div>
            </div>
            <div className="rounded-md border bg-muted/40 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Cost
              </div>
              <div className="mt-1 flex items-center gap-0.5 font-medium">
                {Array.from({ length: 3 }, (_, index) => {
                  const isActive = index < model.costLevel;
                  return (
                    <span
                      key={index}
                      className={cn(
                        "text-sm leading-none",
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground/35",
                      )}
                    >
                      $
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Best For
            </div>
            <p className="mt-1 text-xs leading-5 text-foreground/90">
              {model.strengths}
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

const MODEL_PROVIDERS: Array<{
  provider: ModelProvider;
  models: ModelConfig[];
}> = [
  {
    provider: "Gemini",
    models: [
      {
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro",
        description: "Higher-quality reasoning for complex work",
        speed: "Medium",
        costLevel: 3,
        strengths:
          "Complex reasoning, long-context work, and higher-quality structured output.",
      },
      {
        id: "gemini-3-flash-preview",
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
    models: [
      {
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        description: "Strong coding and general reasoning model",
        speed: "Medium",
        costLevel: 3,
        strengths:
          "Coding, agent-style workflows, and reliable multi-step reasoning.",
      },
      {
        id: "anthropic/claude-haiku-4.5",
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
    models: [
      {
        id: "openai/gpt-5-chat",
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

const ALL_MODELS = MODEL_PROVIDERS.flatMap((provider) => provider.models);

function getModelDisplayName(modelId: string): string {
  const model = ALL_MODELS.find((item) => item.id === modelId);
  return model?.name ?? modelId;
}

export function ModelPicker() {
  const selectedModelId = useUIStore((state) => state.selectedModelId);
  const setSelectedModelId = useUIStore((state) => state.setSelectedModelId);
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);

  const selectedModel = useMemo(
    () =>
      ALL_MODELS.find((model) => model.id === selectedModelId) ?? ALL_MODELS[0],
    [selectedModelId],
  );

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setHoveredModelId(null);
        }
        if (!open) {
          focusComposerInput();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1.5 rounded-md bg-sidebar-accent px-1.5 py-1 text-xs font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <span>{getModelDisplayName(selectedModel.id)}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="w-60"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {MODEL_PROVIDERS.map((group, groupIndex) => (
          <DropdownMenuGroup key={group.provider}>
            {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="px-2 py-1 text-[10px] tracking-wide text-muted-foreground/90">
              {PROVIDER_COMPANY_NAMES[group.provider]}
            </DropdownMenuLabel>
            {group.models.map((model) => (
              <ModelDropdownItem
                key={model.id}
                provider={group.provider}
                model={model}
                isSelected={selectedModelId === model.id}
                isHoverOpen={hoveredModelId === model.id}
                onHoverOpenChange={(open) => {
                  setHoveredModelId(open ? model.id : null);
                }}
                onSelect={() => {
                  setSelectedModelId(model.id);
                  setHoveredModelId(null);
                  setIsOpen(false);
                  focusComposerInput();
                }}
              />
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
