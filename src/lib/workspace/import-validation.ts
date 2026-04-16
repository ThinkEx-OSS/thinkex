import type {
  Item,
  CardType,
} from "@/lib/workspace-state/types";

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  data?: Item[];
}

const VALID_CARD_TYPES: CardType[] = ["document", "pdf", "flashcard"];

export function validateImportedJSON(jsonString: string): ValidationResult {
  try {
    const parsed = JSON.parse(jsonString);
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray(parsed.items)
        ? parsed.items
        : null;

    if (!items) {
      return {
        isValid: false,
        error: "JSON must be an item array or an object with an 'items' array",
      };
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemError = validateItem(item, i);
      if (itemError) {
        return {
          isValid: false,
          error: itemError
        };
      }
    }

    return {
      isValid: true,
      data: items,
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


  return null;
}

export function generateImportPreview(items: Item[]): string {
  const itemCounts = items.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {} as Record<CardType, number>);

  const parts: string[] = [];

  if (items.length > 0) {
    const itemSummary = Object.entries(itemCounts)
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ');
    parts.push(`Items: ${itemSummary}`);
  } else {
    parts.push('No items');
  }

  return parts.join('  ');
}
