import type { AgentState, Item, CardType } from "@/lib/workspace-state/types";

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  data?: AgentState;
}

const VALID_CARD_TYPES: CardType[] = ["note", "pdf", "flashcard"];

export function validateImportedJSON(jsonString: string): ValidationResult {
  try {
    const parsed = JSON.parse(jsonString);

    if (!parsed || typeof parsed !== 'object') {
      return {
        isValid: false,
        error: "JSON must be an object"
      };
    }

    if (!('items' in parsed)) {
      return {
        isValid: false,
        error: "JSON must contain an 'items' array"
      };
    }

    if (!Array.isArray(parsed.items)) {
      return {
        isValid: false,
        error: "'items' must be an array"
      };
    }

    for (let i = 0; i < parsed.items.length; i++) {
      const item = parsed.items[i];
      const itemError = validateItem(item, i);
      if (itemError) {
        return {
          isValid: false,
          error: itemError
        };
      }
    }

    const validatedState: AgentState = {
      items: parsed.items,
      globalTitle: typeof parsed.globalTitle === 'string' ? parsed.globalTitle : "",
      globalDescription: typeof parsed.globalDescription === 'string' ? parsed.globalDescription : "",
      itemsCreated: typeof parsed.itemsCreated === 'number' ? parsed.itemsCreated : parsed.items.length,
    };

    return {
      isValid: true,
      data: validatedState
    };

  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? `Invalid JSON: ${error.message}` : "Invalid JSON format"
    };
  }
}

function validateItem(item: any, index: number): string | null {
  if (!item || typeof item !== 'object') {
    return `Item ${index + 1}: must be an object`;
  }

  if (!item.id || typeof item.id !== 'string') {
    return `Item ${index + 1}: must have a valid 'id' string`;
  }

  if (!item.type || !VALID_CARD_TYPES.includes(item.type)) {
    return `Item ${index + 1}: must have a valid 'type' (${VALID_CARD_TYPES.join(', ')})`;
  }

  if (!item.name || typeof item.name !== 'string') {
    return `Item ${index + 1}: must have a valid 'name' string`;
  }

  if (!item.data || typeof item.data !== 'object') {
    return `Item ${index + 1}: must have a valid 'data' object`;
  }

  if (item.subtitle !== undefined && typeof item.subtitle !== 'string') {
    return `Item ${index + 1}: 'subtitle' must be a string if provided`;
  }

  if (item.color !== undefined && typeof item.color !== 'string') {
    return `Item ${index + 1}: 'color' must be a string if provided`;
  }

  if (item.layout !== undefined) {
    if (typeof item.layout !== 'object' ||
      typeof item.layout.x !== 'number' ||
      typeof item.layout.y !== 'number' ||
      typeof item.layout.w !== 'number' ||
      typeof item.layout.h !== 'number') {
      return `Item ${index + 1}: 'layout' must have numeric x, y, w, h properties if provided`;
    }
  }

  return null;
}

export function generateImportPreview(state: AgentState): string {
  const itemCounts = state.items.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {} as Record<CardType, number>);

  const parts: string[] = [];

  if (state.globalTitle) {
    parts.push(`Title: "${state.globalTitle}"`);
  }

  if (state.items.length > 0) {
    const itemSummary = Object.entries(itemCounts)
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ');
    parts.push(`Items: ${itemSummary}`);
  } else {
    parts.push('No items');
  }

  return parts.join('  ');
}