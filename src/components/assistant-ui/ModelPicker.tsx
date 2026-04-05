import { useState } from "react";
import NextImage from "next/image";
import { FaCheck } from "react-icons/fa6";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CHAT_MODEL_PROVIDER_GROUPS,
  getChatModelDisplayName,
  resolveChatModelConfig,
  type ChatModelConfig,
  type ChatModelProvider,
} from "@/lib/ai/model-registry";
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

function ModelProviderIcon({
  provider,
  className,
}: {
  provider: ChatModelProvider;
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

const modelRowButtonClass =
  "relative flex w-full min-h-8 cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-sm outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground";

function ModelPickerRow({
  provider,
  model,
  isSelected,
  onSelect,
  descriptionHoverOpen,
  onDescriptionHoverOpenChange,
}: {
  provider: ChatModelProvider;
  model: ChatModelConfig;
  isSelected: boolean;
  onSelect: () => void;
  descriptionHoverOpen: boolean;
  onDescriptionHoverOpenChange: (open: boolean) => void;
}) {
  return (
    <HoverCard
      openDelay={0}
      closeDelay={250}
      open={descriptionHoverOpen}
      onOpenChange={onDescriptionHoverOpenChange}
    >
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          aria-label={model.description}
          className={cn(
            modelRowButtonClass,
            isSelected && "bg-accent/50",
          )}
        >
          <ModelProviderIcon provider={provider} />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {model.name}
          </span>
          <span className="flex size-3 shrink-0 items-center justify-center">
            {isSelected ? (
              <FaCheck className="size-3 text-sidebar-foreground/80" />
            ) : null}
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="right"
        collisionPadding={12}
        exitAnimation={false}
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

export function ModelPicker() {
  const selectedModelId = useUIStore((state) => state.selectedModelId);
  const setSelectedModelId = useUIStore((state) => state.setSelectedModelId);
  const [isOpen, setIsOpen] = useState(false);
  const [hoverDescModelId, setHoverDescModelId] = useState<string | null>(null);

  const selectedModel = resolveChatModelConfig(selectedModelId);

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setHoverDescModelId(null);
          focusComposerInput();
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1.5 rounded-md bg-sidebar-accent px-1.5 py-1 text-xs font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <span>{getChatModelDisplayName(selectedModel.id)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={4}
        collisionPadding={12}
        className="w-60 p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {CHAT_MODEL_PROVIDER_GROUPS.map((group, groupIndex) => (
          <div key={group.provider}>
            {groupIndex > 0 ? (
              <div className="bg-border -mx-1 my-1 h-px" role="separator" />
            ) : null}
            <div className="px-2 py-1 text-[10px] tracking-wide text-muted-foreground/90">
              {PROVIDER_COMPANY_NAMES[group.provider] ?? group.companyName}
            </div>
            {group.models.map((model) => (
              <ModelPickerRow
                key={model.id}
                provider={group.provider}
                model={model}
                isSelected={selectedModelId === model.id}
                descriptionHoverOpen={hoverDescModelId === model.id}
                onDescriptionHoverOpenChange={(descOpen) => {
                  if (descOpen) {
                    setHoverDescModelId(model.id);
                  } else {
                    setHoverDescModelId((prev) =>
                      prev === model.id ? null : prev,
                    );
                  }
                }}
                onSelect={() => {
                  setSelectedModelId(model.id);
                  setIsOpen(false);
                  setHoverDescModelId(null);
                  focusComposerInput();
                }}
              />
            ))}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
