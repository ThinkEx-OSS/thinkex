import type { AgentState, TemplateDefinition } from "@/lib/workspace-state/types";
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
    initialState: {
      items: [],
      globalTitle: "",
      globalDescription: "",
      itemsCreated: 0,
    },
  },
  (() => {
    const sampleColors = generateDistinctColors(3);
    return {
      name: "Getting Started",
      description: "Start with sample content",
      template: "getting_started",
      initialState: {
        items: [
          {
            id: "sample-note-1",
            type: "note",
            name: "Update me", // Special name triggers generating skeleton in UI
            subtitle: "",
            data: {
              blockContent: [], // Empty content for generating state
              field1: "",
            },
            color: sampleColors[0],
            layout: { x: 2, y: 5, w: 1, h: 4 },
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
            layout: { x: 0, y: 0, w: 2, h: 13 },
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
            layout: { x: 2, y: 0, w: 2, h: 5 },
          }
        ],
        globalTitle: "",
        globalDescription: "",
        itemsCreated: 3,
      },
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
export function getTemplateInitialState(template: string): AgentState {
  const templateDef = getTemplateByType(template);
  return {
    items: templateDef.initialState.items || [],
    globalTitle: templateDef.initialState.globalTitle || "",
    globalDescription: templateDef.initialState.globalDescription || "",
    itemsCreated: templateDef.initialState.itemsCreated || 0,
  };
}
