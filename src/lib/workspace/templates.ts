import type {
  Item,
  TemplateDefinition,
} from "@/lib/workspace-state/types";
import { getDistinctCardColor, type CardColor } from "@/lib/workspace-state/colors";

/**
 * Helper function to generate distinct colors for template items
 */
function generateDistinctColors(count: number): CardColor[] {
  const colors: CardColor[] = [];
  for (let i = 0; i < count; i++) {
    const newColor = getDistinctCardColor(colors, 0.4);
    colors.push(newColor);
  }
  return colors;
}

/**
 * Workspace templates with pre-filled content
 */
export const WORKSPACE_TEMPLATES: TemplateDefinition[] = [
  {
    name: "Blank",
    description: "Start from scratch",
    template: "blank",
    initialItems: [],
  },
  (() => {
    const sampleColors = generateDistinctColors(3);
    return {
      name: "Getting Started",
      description: "Start with sample content",
      template: "getting_started",
      initialItems: [
          {
            id: "sample-document-1",
            type: "document",
            name: "Update me", // Special name triggers generating skeleton in UI
            subtitle: "",
            data: {
              markdown: "",
            },
            color: sampleColors[0],
          },
          {
            id: "sample-quiz-1",
            type: "quiz",
            name: "Update me", // Special name triggers generating skeleton in UI
            subtitle: "",
            data: {
              questions: []
            },
            color: sampleColors[1],
          },
          {
            id: "sample-flashcard-1",
            type: "flashcard",
            name: "Update me", // Special name triggers generating skeleton in UI
            subtitle: "",
            data: {
              cards: []
            },
            color: sampleColors[2],
          }
        ],
    };
  })(),
];

/**
 * Get template by type
 */
export function getTemplateByType(template: string): TemplateDefinition {
  return WORKSPACE_TEMPLATES.find((t) => t.template === template) || WORKSPACE_TEMPLATES[0];
}

/**
 * Get initial state for a template
 */
export function getTemplateInitialItems(template: string): Item[] {
  const templateDef = getTemplateByType(template);
  return structuredClone(templateDef.initialItems);
}
