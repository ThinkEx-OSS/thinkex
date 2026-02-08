/**
 * Color utilities for canvas cards
 * Generates random background colors with good contrast against dark backgrounds
 * and ensures no adjacent similar colors
 */

// Predefined color palette with good contrast against dark grey (#202124)
// 90 colors organized for SwatchesPicker (18 groups × 5 colors)
// Arranged in rainbow/color wheel order for intuitive selection
export const CANVAS_CARD_COLORS = [
  // Group 1: Reds
  '#FCA5A5', '#F87171', '#EF4444', '#DC2626', '#B91C1C',
  // Group 2: Roses
  '#FDA4AF', '#FB7185', '#F43F5E', '#E11D48', '#BE123C',
  // Group 3: Pinks
  '#F9A8D4', '#F472B6', '#EC4899', '#DB2777', '#BE185D',
  // Group 4: Fuchsias
  '#F0ABFC', '#E879F9', '#D946EF', '#C026D3', '#A21CAF',
  // Group 5: Oranges
  '#FDB972', '#FB923C', '#F97316', '#EA580C', '#C2410C',
  // Group 6: Ambers
  '#FCD34D', '#FBBF24', '#F59E0B', '#D97706', '#B45309',
  // Group 7: Yellows
  '#FDE047', '#FACC15', '#EAB308', '#CA8A04', '#A16207',
  // Group 8: Limes
  '#D9F99D', '#BEF264', '#A3E635', '#84CC16', '#65A30D',
  // Group 9: Greens
  '#86EFAC', '#4ADE80', '#22C55E', '#16A34A', '#15803D',
  // Group 10: Emeralds
  '#6EE7B7', '#34D399', '#10B981', '#059669', '#047857',
  // Group 11: Teals
  '#5EEAD4', '#2DD4BF', '#14B8A6', '#0D9488', '#0F766E',
  // Group 12: Cyans
  '#67E8F9', '#22D3EE', '#06B6D4', '#0891B2', '#0E7490',
  // Group 13: Sky Blues
  '#7DD3FC', '#38BDF8', '#0EA5E9', '#0284C7', '#0369A1',
  // Group 14: Blues
  '#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8',
  // Group 15: Indigos
  '#A5B4FC', '#818CF8', '#6366F1', '#4F46E5', '#4338CA',
  // Group 16: Violets
  '#C4B5FD', '#A78BFA', '#8B5CF6', '#7C3AED', '#6D28D9',
  // Group 17: Purples
  '#D8B4FE', '#C084FC', '#A855F7', '#9333EA', '#7E22CE',
  // Group 18: Deep Purples
  '#5B21B6', '#4C1D95', '#3E1A75', '#311560', '#271050',
] as const;

export type CardColor = typeof CANVAS_CARD_COLORS[number];

/**
 * Color groups organized for SwatchesPicker
 * 18 groups with exactly 5 colors each for a clean grid layout
 * Arranged in rainbow/color wheel order: Red → Orange → Yellow → Green → Cyan → Blue → Purple → Pink
 */
export const SWATCHES_COLOR_GROUPS = [
  ['#FCA5A5', '#F87171', '#EF4444', '#DC2626', '#B91C1C'],
  ['#FDA4AF', '#FB7185', '#F43F5E', '#E11D48', '#BE123C'],
  ['#F9A8D4', '#F472B6', '#EC4899', '#DB2777', '#BE185D'],
  ['#F0ABFC', '#E879F9', '#D946EF', '#C026D3', '#A21CAF'],
  ['#FDB972', '#FB923C', '#F97316', '#EA580C', '#C2410C'],
  ['#FCD34D', '#FBBF24', '#F59E0B', '#D97706', '#B45309'],
  ['#FDE047', '#FACC15', '#EAB308', '#CA8A04', '#A16207'],
  ['#D9F99D', '#BEF264', '#A3E635', '#84CC16', '#65A30D'],
  ['#86EFAC', '#4ADE80', '#22C55E', '#16A34A', '#15803D'],
  ['#6EE7B7', '#34D399', '#10B981', '#059669', '#047857'],
  ['#5EEAD4', '#2DD4BF', '#14B8A6', '#0D9488', '#0F766E'],
  ['#67E8F9', '#22D3EE', '#06B6D4', '#0891B2', '#0E7490'],
  ['#7DD3FC', '#38BDF8', '#0EA5E9', '#0284C7', '#0369A1'],
  ['#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8'],
  ['#A5B4FC', '#818CF8', '#6366F1', '#4F46E5', '#4338CA'],
  ['#C4B5FD', '#A78BFA', '#8B5CF6', '#7C3AED', '#6D28D9'],
  ['#D8B4FE', '#C084FC', '#A855F7', '#9333EA', '#7E22CE'],
  ['#5B21B6', '#4C1D95', '#3E1A75', '#311560', '#271050'],
];

/**
 * Calculate color similarity using RGB distance
 * Returns a value between 0 (identical) and 1 (completely different)
 */
export function calculateColorSimilarity(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  
  if (!rgb1 || !rgb2) return 1;
  
  const distance = Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
    Math.pow(rgb1.g - rgb2.g, 2) +
    Math.pow(rgb1.b - rgb2.b, 2)
  );
  
  // Normalize to 0-1 range (max distance is sqrt(3 * 255^2) ≈ 441.67)
  return distance / 441.67;
}

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * Get a random color from the palette
 */
export function getRandomCardColor(): CardColor {
  const randomIndex = Math.floor(Math.random() * CANVAS_CARD_COLORS.length);
  return CANVAS_CARD_COLORS[randomIndex];
}

/**
 * Get a color that's sufficiently different from the given colors
 * @param existingColors Array of colors to avoid similarity with
 * @param minSimilarity Minimum similarity threshold (0-1, lower means more different)
 * @returns A color that meets the similarity requirements
 */
export function getDistinctCardColor(
  existingColors: CardColor[], 
  minSimilarity: number = 0.3
): CardColor {
  if (existingColors.length === 0) {
    return getRandomCardColor();
  }
  
  // Try to find a color that's different enough from existing ones
  for (let attempts = 0; attempts < 50; attempts++) {
    const candidate = getRandomCardColor();
    const isDistinct = existingColors.every(existingColor => 
      calculateColorSimilarity(candidate, existingColor) >= minSimilarity
    );
    
    if (isDistinct) {
      return candidate;
    }
  }
  
  // If we can't find a distinct color after 50 attempts, return a random one
  return getRandomCardColor();
}

/**
 * Assign colors to cards ensuring no adjacent cards have similar colors
 * @param items Array of items to assign colors to
 * @param existingColors Map of existing item colors (for persistence)
 * @returns Map of item IDs to their assigned colors
 */
export function assignCardColors(
  items: { id: string }[],
  existingColors: Map<string, CardColor> = new Map()
): Map<string, CardColor> {
  const colorMap = new Map<string, CardColor>();
  
  // Keep existing colors for items that already have them
  items.forEach(item => {
    if (existingColors.has(item.id)) {
      colorMap.set(item.id, existingColors.get(item.id)!);
    }
  });
  
  // Assign colors to new items
  items.forEach((item, index) => {
    if (!colorMap.has(item.id)) {
      // Get colors of nearby items (expanded range to prevent similar colors)
      const nearbyColors: CardColor[] = [];
      
      // Check the last 5 items instead of just adjacent ones
      const startIndex = Math.max(0, index - 5);
      for (let i = startIndex; i < index; i++) {
        const nearbyColor = colorMap.get(items[i].id);
        if (nearbyColor) nearbyColors.push(nearbyColor);
      }
      
      // Also check the next 2 items
      for (let i = index + 1; i < Math.min(items.length, index + 3); i++) {
        const nextColor = colorMap.get(items[i].id);
        if (nextColor) nearbyColors.push(nextColor);
      }
      
      // Get a color that's very distinct from nearby colors
      // Increased similarity threshold from 0.25 to 0.4 for more distinct colors
      const distinctColor = getDistinctCardColor(nearbyColors, 0.4);
      colorMap.set(item.id, distinctColor);
    }
  });
  
  return colorMap;
}

/**
 * Generate CSS custom property for a card color with proper opacity
 */
export function getCardColorCSS(color: CardColor, opacity: number = 0.15): string {
  const rgb = hexToRgb(color);
  if (!rgb) return 'rgba(59, 130, 246, 0.15)'; // fallback
  
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

/**
 * Get a lighter version of a color for borders or accents
 */
export function getCardAccentColor(color: CardColor, opacity: number = 0.3): string {
  const rgb = hexToRgb(color);
  if (!rgb) return 'rgba(59, 130, 246, 0.3)'; // fallback
  
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

/**
 * Get a white-tinted version of a color (blends color with white)
 * @param color The card color
 * @param whiteMix The amount of white to mix (0-1, where 1 is pure white)
 * @param opacity The final opacity of the result
 */
export function getWhiteTintedColor(color: CardColor, whiteMix: number = 0.7, opacity: number = 0.3): string {
  const rgb = hexToRgb(color);
  if (!rgb) return `rgba(255, 255, 255, ${opacity})`; // fallback to white
  
  // Blend with white: mix = whiteMix * white + (1 - whiteMix) * color
  const r = Math.round(whiteMix * 255 + (1 - whiteMix) * rgb.r);
  const g = Math.round(whiteMix * 255 + (1 - whiteMix) * rgb.g);
  const b = Math.round(whiteMix * 255 + (1 - whiteMix) * rgb.b);
  
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
