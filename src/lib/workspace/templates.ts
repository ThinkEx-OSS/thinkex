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
            name: "Prompt to Workspace",
            subtitle: "AI-Generated Note",
            data: {
              blockContent: [
                {
                  id: "nb1",
                  type: "paragraph",
                  props: { backgroundColor: "default", textColor: "default", textAlignment: "left" },
                  content: [
                    {
                      type: "text",
                      text: "Try typing a prompt like ",
                      styles: {}
                    },
                    {
                      type: "text",
                      text: "\"Research AI trends and create a note\"",
                      styles: { italic: true }
                    },
                    {
                      type: "text",
                      text: " or ",
                      styles: {}
                    },
                    {
                      type: "text",
                      text: "\"Summarize this article: [URL]\"",
                      styles: { italic: true }
                    },
                    {
                      type: "text",
                      text: ". When notes are generated from web searches or URLs, they'll include source links like the ones shown above.",
                      styles: {}
                    }
                  ],
                  children: []
                }
              ],
              field1: "",
              sources: [
                {
                  title: "ThinkEx Documentation",
                  url: "https://github.com/thinkex/docs"
                },
                {
                  title: "Getting Started Guide",
                  url: "https://example.com/getting-started"
                }
              ]
            },
            color: sampleColors[0],
            layout: { x: 0, y: 0, w: 4, h: 9 },
          },
          {
            id: "sample-quiz-1",
            type: "quiz",
            name: "Quiz",
            subtitle: "",
            data: {
              questions: []
            },
            color: sampleColors[1],
            layout: { x: 0, y: 9, w: 2, h: 13 },
          },
          {
            id: "sample-flashcard-1",
            type: "flashcard",
            name: "Flashcards",
            subtitle: "",
            data: {
              cards: []
            },
            color: sampleColors[2],
            layout: { x: 2, y: 9, w: 2, h: 9 },
          }
        ],
        globalTitle: "",
        globalDescription: "",
        itemsCreated: 3,
      },
    };
  })(),
  (() => {
    const pmColors = generateDistinctColors(3);
    return {
      name: "Project Management",
      description: "Track projects with tasks and timelines",
      template: "project_management",
      initialState: {
        items: [
          {
            id: "note-1",
            type: "note",
            name: "Website Redesign Plan",
            subtitle: "Q1 2025 Initiative",
            color: pmColors[0],
            x: 0,
            y: 0,
            w: 6,
            h: 2,
            data: {
              field1: `**Objective:** Redesign the company website with a modern UI/UX refresh.\n\n**Next Steps:**\n- [x] Create wireframes\n- [ ] Design mockups\n- [ ] Develop frontend\n- [ ] Test and deploy\n\n**Target Date:** ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}`,
            },
          },
          {
            id: "note-2",
            type: "note",
            name: "Product Launch Campaign",
            subtitle: "Marketing Rollout",
            color: pmColors[1],
            x: 6,
            y: 0,
            w: 6,
            h: 2,
            data: {
              field1: `**Goal:** Plan and execute the go-to-market strategy for the new product launch.\n\n**Action Items:**\n- Define target audience\n- Create content calendar\n- Launch campaign\n\n**Planned Launch:** ${new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}`,
            },
          },
          {
            id: "note-3",
            type: "note",
            name: "Project Goals",
            subtitle: "2025 Objectives",
            color: pmColors[2],
            x: 0,
            y: 2,
            w: 12,
            h: 1,
            data: {
              field1: "1. Increase user engagement by 30%\n2. Launch 3 new features\n3. Improve performance by 50%\n4. Expand to 5 new markets",
            },
          },
        ],
        globalTitle: "Project Management Hub",
        globalDescription: "Track all your projects and tasks in one place",
        itemsCreated: 3,
      },
    };
  })(),
  (() => {
    const kbColors = generateDistinctColors(4);
    return {
      name: "Knowledge Base",
      description: "Organize information and notes",
      template: "knowledge_base",
      initialState: {
        items: [
          {
            id: "note-1",
            type: "note",
            name: "Product Features",
            subtitle: "Core Capabilities",
            color: kbColors[0],
            x: 0,
            y: 0,
            w: 6,
            h: 2,
            data: {
              field1: "**Overview:** Key features and capabilities of our product offering.\n\n**Highlights:**\n- Real-time collaboration\n- AI-assisted workflows\n- Secure storage and sharing\n- Integrations with popular tools",
            },
          },
          {
            id: "note-2",
            type: "note",
            name: "Customer Insights",
            subtitle: "User Feedback",
            color: kbColors[1],
            x: 6,
            y: 0,
            w: 6,
            h: 2,
            data: {
              field1: "**Theme:** Collected feedback and insights from customer interviews.\n\n**Top Notes:**\n- Users value streamlined onboarding\n- Requests for deeper analytics\n- Appreciation for responsive support",
            },
          },
          {
            id: "note-3",
            type: "note",
            name: "Meeting Notes",
            subtitle: "Team Sync - Jan 2025",
            color: kbColors[2],
            x: 0,
            y: 2,
            w: 6,
            h: 2,
            data: {
              field1: "**Key Takeaways:**\n- Discussed Q1 priorities\n- Reviewed customer feedback\n- Planned next sprint\n\n**Action Items:**\n- Update documentation\n- Schedule follow-up meeting",
            },
          },
          {
            id: "note-4",
            type: "note",
            name: "Research Findings",
            subtitle: "Market Analysis",
            color: kbColors[3],
            x: 6,
            y: 2,
            w: 6,
            h: 2,
            data: {
              field1: "**Market Trends:**\n- Growing demand for AI features\n- Mobile-first approach critical\n- Privacy concerns increasing\n\n**Opportunities:**\n- Enterprise segment expansion\n- Partnership opportunities",
            },
          },
        ],
        globalTitle: "Knowledge Base",
        globalDescription: "Centralized repository for information and documentation",
        itemsCreated: 4,
      },
    };
  })(),
  (() => {
    const tpColors = generateDistinctColors(4);
    return {
      name: "Team Planning",
      description: "Plan sprints and track team metrics",
      template: "team_planning",
      initialState: {
        items: [
          {
            id: "note-1",
            type: "note",
            name: "Sprint 24 Plan",
            subtitle: "January 15-29, 2025",
            color: tpColors[0],
            x: 0,
            y: 0,
            w: 12,
            h: 2,
            data: {
              field1: `**Focus:** Two-week sprint dedicated to core feature delivery.\n\n**Planned Work:**\n- Complete user authentication flow\n- Implement dashboard analytics\n- Bug fixes and QA testing\n\n**Sprint End:** ${new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}`,
            },
          },
          {
            id: "note-2",
            type: "note",
            name: "Team Velocity Snapshot",
            subtitle: "Sprint Performance",
            color: tpColors[1],
            x: 0,
            y: 2,
            w: 6,
            h: 2,
            data: {
              field1: "**Story Points Completed:**\n- Sprint 21: 72\n- Sprint 22: 85\n- Sprint 23: 78\n- Sprint 24: 90\n\nTrend remains positive with consistent improvements.",
            },
          },
          {
            id: "note-3",
            type: "note",
            name: "Team Health Check",
            subtitle: "Current Metrics",
            color: tpColors[2],
            x: 6,
            y: 2,
            w: 6,
            h: 2,
            data: {
              field1: "**Pulse Survey Results:**\n- Morale: 85%\n- Productivity: 78%\n- Collaboration: 92%\n- Work-Life Balance: 75%\n\nFollow up on work-life balance concerns.",
            },
          },
          {
            id: "note-4",
            type: "note",
            name: "Team Members",
            subtitle: "Engineering Team",
            color: tpColors[3],
            x: 0,
            y: 4,
            w: 12,
            h: 2,
            data: {
              field1: "**Roster:**\n- Alice — Engineering Lead\n- Ben — Backend Engineer\n- Chloe — Frontend Engineer\n- Diego — QA Specialist\n\nStatus: Active sprint participants with daily standups at 9am PT.",
            },
          },
        ],
        globalTitle: "Team Planning Board",
        globalDescription: "Sprint planning and team performance tracking",
        itemsCreated: 4,
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

