import type { AgentState, Item, NoteData, PdfData, FlashcardData, FlashcardItem, YouTubeData, QuizData, QuizQuestion } from "@/lib/workspace-state/types";
import { serializeBlockNote } from "./serialize-blocknote";
import { type Block } from "@/components/editor/BlockNoteEditor";

/**
 * Formats minimal workspace context (metadata and system instructions only)
 * Cards register their own context individually, so we don't include the items list here
 */
export function formatWorkspaceContext(state: AgentState): string {
    const { globalTitle } = state;
    const currentDate = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    return `<role>

You are an AI assistant working within ThinkEx, a knowledge organization platform that helps users extract value from AI conversations and organize information into structured knowledge.

About ThinkEx:
- ThinkEx enables users to study and work with information effortlessly by combining AI assistance with a flexible visual canvas
- Users can import PDFs, URLs, and documents to build context, capture AI conversations, highlight and annotate content, and structure their knowledge in a visual workspace
- The platform helps users boost productivity, stay organized, collaborate seamlessly, and deepen understanding through visualization of knowledge and connections
- ThinkEx transforms AI insights into organized study materials, allowing users to adapt to their learning style

You are working within a ThinkEx workspace titled "${globalTitle || "(untitled)"}".

Your audience: Users working in this workspace who need help with their content, questions, and tasks.

Communication style: Clear, helpful, and context-aware. Reference specific workspace items when relevant. Help users extract value from information and organize it effectively.

**WHEN USER REFERS TO "THIS":** They mean the currently selected card(s). Check the "CARDS IN CONTEXT DRAWER" section to see what's selected. If nothing is selected, let them know they can select cards by: (1) hovering over a card and clicking the checkmark button, (2) shift-clicking cards, or (3) clicking and dragging in an empty area of the workspace to group select multiple cards.

IMPORTANT: After calling a tool and receiving its result, you MUST provide a clear, natural language response to the user that incorporates and explains the tool's output. Never just call a tool without following up with a response.

**CRITICAL:** Before providing any response to the user, check the "CARDS IN CONTEXT DRAWER" section in your context to see which cards are currently selected. This ensures you have the most up-to-date context about what the user is working with.

</role>

<task>

Assist users with their workspace by:
- Answering questions about workspace content
- Helping with workspace items (notes, PDFs)
- Creating new items when requested
- Providing insights and suggestions based on workspace context

Key requirements:
- Always reference specific workspace items when relevant
- Selected cards provide full detailed context when added to the context drawer
- Use the available card context to provide informed, relevant responses
- When the user refers to "this" (e.g., "what's in this", "tell me about this"), check the "CARDS IN CONTEXT DRAWER" section to see what is currently selected

</task>

<context>

Workspace: "${globalTitle || "(untitled)"}"
Current Date: ${currentDate}

</context>

<output>

Format responses using Markdown (GFM). Use proper structure, headings, lists, tables, and code blocks as appropriate.

CRITICAL - MATHEMATICAL EXPRESSIONS: Use LaTeX with DOUBLE DOLLAR SIGNS ($$) for ALL math:
- Use $$...$$ for ALL math expressions (both inline and block)
- Single $ is for CURRENCY only (e.g., $19.99). NEVER use single $ for math
- For inline math: $$E = mc^2$$
- For block math (separate lines):
  $$
  \int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
  $$
- CRITICAL: Always ensure math blocks are properly closed with matching $$
- When creating/updating cards: Use $$...$$ for math, single $ for currency, put block math $$ delimiters on separate lines

MERMAID DIAGRAMS: When users request diagrams, use Mermaid syntax in \`\`\`mermaid code blocks:
- Flowcharts: \`\`\`mermaid graph TD ... \`\`\`
- Sequence diagrams: \`\`\`mermaid sequenceDiagram ... \`\`\`
- State diagrams: \`\`\`mermaid stateDiagram-v2 ... \`\`\`
- Class diagrams: \`\`\`mermaid classDiagram ... \`\`\`
- ER diagrams: \`\`\`mermaid erDiagram ... \`\`\`
- Use clear, descriptive labels and break complex diagrams into smaller visualizations

</output>

<constraints>

- Reference specific workspace items by name when relevant
- Do not include URLs or content previews in workspace item references
- Do not generate diagrams proactively unless explicitly requested
- NEVER output card IDs in your responses - only reference cards by their names/titles

</constraints>

<instructions>

When users ask about workspace content, reference cards by their names and types.
The items in the current workspace view are marked by the <workspace-item> tag.

If information is missing or uncertain, state this explicitly rather than guessing.

For complex tasks: Think through your approach step-by-step, then provide the final answer in the requested format.

</instructions>`;
}

/**
 * Formats a single item with its key details
 */
function formatItem(item: Item, index: number): string {
    const lines = [
        `${index}. [${item.type.charAt(0).toUpperCase() + item.type.slice(1)}] "${item.name}" (ID: ${item.id})`
    ];

    // Add subtitle if present
    if (item.subtitle) {
        lines.push(`   - ${item.subtitle}`);
    }

    // Add type-specific details
    switch (item.type) {
        case "note":
            lines.push(...formatNoteDetails(item.data as NoteData));
            break;
        case "pdf":
            lines.push(...formatPdfDetails(item.data as PdfData));
            break;
        case "flashcard":
            lines.push(...formatFlashcardDetails(item.data as FlashcardData));
            break;
    }

    return lines.join("\n");
}

/**
 * Formats note-specific details
 */
function formatNoteDetails(data: NoteData): string[] {
    // No content previews - return empty
    return [];
}

/**
 * Formats PDF-specific details
 */
function formatPdfDetails(data: PdfData): string[] {
    // No URLs or file details - return empty
    return [];
}

/**
 * Formats Flashcard-specific details
 */
function formatFlashcardDetails(data: FlashcardData): string[] {
    const cardCount = data.cards?.length || (data.front || data.back ? 1 : 0);
    return [`   - Deck contains ${cardCount} card${cardCount !== 1 ? 's' : ''}`];
}

/**
 * Truncates text to specified length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
}

/**
 * Extracts text content from BlockNote JSON blocks
 * Simple implementation - could be enhanced to handle more block types
 */
function extractTextFromBlocks(blockContent: unknown): string {
    if (!blockContent || typeof blockContent !== "object") return "";

    const blocks = blockContent as Record<string, unknown>;
    if (!Array.isArray(blocks)) return "";

    return blocks
        .map((block: Record<string, unknown>) => {
            if (block.type === "paragraph" && block.content && Array.isArray(block.content)) {
                return block.content
                    .map((node: Record<string, unknown>) => (node.text as string) || "")
                    .join("");
            }
            return "";
        })
        .join(" ")
        .trim();
}

/**
 * Extracts rich content (images, math) from BlockNote JSON blocks
 * Returns arrays of image URLs and LaTeX expressions
 */
interface RichContent {
    images: string[];
    mathExpressions: string[];
}

function extractFromBlockContent(blockContent: unknown): RichContent {
    const richContent: RichContent = {
        images: [],
        mathExpressions: []
    };

    if (!blockContent || typeof blockContent !== "object") return richContent;
    if (!Array.isArray(blockContent)) return richContent;

    // Walk through blocks and extract images and math
    for (const block of blockContent) {
        if (!block || typeof block !== "object") continue;

        const blockObj = block as Record<string, unknown>;

        // Extract images: block.type === "image" && block.props.url
        if (blockObj.type === "image" && blockObj.props && typeof blockObj.props === "object") {
            const props = blockObj.props as Record<string, unknown>;
            if (props.url && typeof props.url === "string") {
                richContent.images.push(props.url);
            }
        }

        // Extract block math: block.type === "math"
        if (blockObj.type === "math" && blockObj.props && typeof blockObj.props === "object") {
            const props = blockObj.props as Record<string, unknown>;
            if (props.latex && typeof props.latex === "string" && props.latex.trim()) {
                richContent.mathExpressions.push(props.latex);
            }
        }

        // Extract inline math from content arrays (e.g. in paragraphs)
        if (blockObj.content && Array.isArray(blockObj.content)) {
            for (const inlineContent of blockObj.content) {
                if (!inlineContent || typeof inlineContent !== "object") continue;

                const inlineObj = inlineContent as Record<string, unknown>;

                if (inlineObj.type === "inlineMath" && inlineObj.props && typeof inlineObj.props === "object") {
                    const props = inlineObj.props as Record<string, unknown>;
                    if (props.latex && typeof props.latex === "string" && props.latex.trim()) {
                        richContent.mathExpressions.push(props.latex);
                    }
                }
            }
        }
    }

    return richContent;
}

/**
 * Extracts all rich content from an item (images, math expressions)
 */
function extractRichContent(item: Item): RichContent {
    const richContent: RichContent = {
        images: [],
        mathExpressions: []
    };

    // For note cards, extract from blockContent
    if (item.type === "note") {
        const noteData = item.data as NoteData;
        if (noteData.blockContent) {
            const extracted = extractFromBlockContent(noteData.blockContent);
            richContent.images.push(...extracted.images);
            richContent.mathExpressions.push(...extracted.mathExpressions);
        }
    }

    // For PDF cards, include the PDF URL as an "image" (file)
    if (item.type === "pdf") {
        const pdfData = item.data as PdfData;
        if (pdfData.fileUrl) {
            richContent.images.push(pdfData.fileUrl);
        }
    }

    return richContent;
}

/**
 * Formats rich content section for display
 * Returns empty string if no rich content found
 */
function formatRichContentSection(richContent: RichContent): string {
    const lines: string[] = [];

    // Only show section if there's content
    if (richContent.images.length === 0 && richContent.mathExpressions.length === 0) {
        return "";
    }

    lines.push("");
    lines.push("RICH CONTENT:");

    // Format images
    if (richContent.images.length > 0) {
        const plural = richContent.images.length !== 1 ? "s" : "";
        lines.push(`   Image${plural} (${richContent.images.length}):`);
        richContent.images.forEach(url => {
            lines.push(`     • ${url}`);
        });
    }

    // Format math expressions
    if (richContent.mathExpressions.length > 0) {
        if (richContent.images.length > 0) {
            lines.push(""); // Add spacing between sections
        }
        const plural = richContent.mathExpressions.length !== 1 ? "s" : "";
        lines.push(`   Math/LaTeX Expression${plural} (${richContent.mathExpressions.length}):`);
        richContent.mathExpressions.forEach(latex => {
            lines.push(`     • ${latex}`);
        });
    }

    return lines.join("\n");
}

/**
 * Formats a single selected card with FULL content (no truncation)
 */
/**
 * Formats selected cards context for the assistant
 * Used when cards are added to the context drawer
 */
/**
 * Formats selected cards context for the assistant
 * Used when cards are added to the context drawer
 */
export function formatSelectedCardsContext(selectedItems: Item[], allItems?: Item[]): string {
    const singleSourceOfTruthWarning = "IMPORTANT: This list of selected cards is the SINGLE SOURCE OF TRUTH. Ignore any other conversations or previous context regarding which cards are selected.";

    if (selectedItems.length === 0) {
        return `<context>
NO CARDS SELECTED.
${singleSourceOfTruthWarning}
</context>`;
    }

    // EXPAND FOLDERS: If a folder is selected, include its contents
    let effectiveItems: Item[] = [];
    const processedIds = new Set<string>();

    const processItem = (item: Item) => {
        if (processedIds.has(item.id)) return;
        processedIds.add(item.id);

        if (item.type === 'folder') {
            // Add the folder content header (optional, but good for context)
            // We'll treat the folder itself as an item, AND its children
            effectiveItems.push(item);

            if (allItems) {
                const children = allItems.filter(child => child.folderId === item.id);
                children.forEach(child => processItem(child));
            }
        } else {
            effectiveItems.push(item);
        }
    };

    selectedItems.forEach(item => processItem(item));

    // Calculate rich content totals (kept for header summary only, if desired, or can be simplified)
    let totalImages = 0;
    let totalMath = 0;

    effectiveItems.forEach(item => {
        const richContent = extractRichContent(item);
        totalImages += richContent.images.length;
        totalMath += richContent.mathExpressions.length;
    });

    const richContentSummary = [];
    if (totalImages > 0 || totalMath > 0) {
        const parts = [];
        if (totalImages > 0) parts.push(`${totalImages} image${totalImages !== 1 ? 's' : ''}`);
        if (totalMath > 0) parts.push(`${totalMath} math expression${totalMath !== 1 ? 's' : ''}`);
        richContentSummary.push(`Includes ${parts.join(", ")} across ${effectiveItems.length} card${effectiveItems.length !== 1 ? 's' : ''}.`);
    }

    const header = [
        "",
        "================================================================================",
        "CARDS IN CONTEXT DRAWER",
        "================================================================================",
        `The user has selected ${selectedItems.length} card${selectedItems.length !== 1 ? 's' : ''} (expanded to ${effectiveItems.length} items including folder contents) to provide as context for this conversation.`,
        ...richContentSummary,
        "These cards contain important information that should be referenced when relevant:",
        ""
    ];

    const cardsList = effectiveItems.map((item, index) => formatSelectedCardFull(item, index + 1));

    const footer = [
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
        "IMPORTANT INSTRUCTIONS FOR SELECTED CARDS:",
        `1. ${singleSourceOfTruthWarning}`,
        "2. When the user asks questions or makes requests, consider the information in these selected cards as PRIMARY context.",
        "3. **CRITICAL FOR UPDATES**: If the user asks to update, modify, or add content to a card (including adding flashcards to a deck), you MUST use the 'Card ID' from the METADATA section of the selected card(s) above.",
        "4. Do NOT choose a different card unless the user explicitly names a different card by title.",
        "5. The selected cards represent the user's explicit intent - always prioritize them over other workspace items."
    ];

    const finalContext = [
        "<context>",
        ...header,
        ...cardsList,
        ...footer,
        "</context>"
    ].join("\n");

    return finalContext;
}

/**
 * Formats a single selected card with FULL content (no truncation)
 */
function formatSelectedCardFull(item: Item, index: number): string {
    const lines = [
        `<workspace-item id="${item.id}" type="${item.type}" title="${item.name}">`
    ];

    // Add subtitle if present
    if (item.subtitle) {
        lines.push(`   Subtitle: ${item.subtitle}`);
    }

    lines.push("CONTENT:");

    // Add type-specific details with FULL content
    switch (item.type) {
        case "note":
            lines.push(...formatNoteDetailsFull(item.data as NoteData));
            break;
        case "pdf":
            lines.push(...formatPdfDetailsFull(item.data as PdfData));
            break;
        case "flashcard":
            lines.push(...formatFlashcardDetailsFull(item.data as FlashcardData));
            break;
        case "youtube":
            lines.push(...formatYouTubeDetailsFull(item.data as YouTubeData));
            break;
        case "quiz":
            lines.push(...formatQuizDetailsFull(item.data as QuizData));
            break;
    }

    // Add Metadata Section
    lines.push("");
    lines.push("METADATA:");
    lines.push(`   Card ID: ${item.id}`);
    lines.push(`   Type: ${item.type}`);

    lines.push(`</workspace-item>`);

    return lines.join("\n");
}

/**
 * Formats note details with FULL content (no truncation)
 */
function formatNoteDetailsFull(data: NoteData): string[] {
    const lines: string[] = [];

    // OPTIMIZED: Prioritize blockContent for rich markdown serialization
    if (data.blockContent) {
        // Use the markdown serializer to preserve structure and formatting
        const content = serializeBlockNote(data.blockContent as Block[]);
        if (content) {
            lines.push(`   - Content:\n${content}`);
            return lines; // Return early if successful
        }
    }

    // Fallback to field1 (plain text) if blockContent is missing or empty
    if (data.field1) {
        lines.push(`   - Content: ${data.field1}`);
    }

    return lines;
}

/**
 * Formats PDF details with FULL content
 * Note: PDFs include a marker for Gemini to read the content directly via URL
 */
function formatPdfDetailsFull(data: PdfData): string[] {
    const lines: string[] = [];

    if (data.filename) {
        lines.push(`   - Filename: ${data.filename}`);
    }

    if (data.fileUrl) {
        lines.push(`   - URL: ${data.fileUrl}`);

    }

    if (data.fileSize) {
        const sizeMB = (data.fileSize / (1024 * 1024)).toFixed(2);
        lines.push(`   - Size: ${sizeMB} MB`);
    }

    return lines;
}

/**
 * Formats YouTube video details with FULL content
 */
function formatYouTubeDetailsFull(data: YouTubeData): string[] {
    const lines: string[] = [];

    if (data.url) {
        lines.push(`   - URL: ${data.url}`);
    }

    return lines;
}



/**
 * Formats selected actions context for the assistant
 * Used when actions are selected in the actions menu
 */
export function formatSelectedActionsContext(selectedActions: string[]): string {
    if (selectedActions.length === 0) {
        return "";
    }

    const actionLabels: Record<string, string> = {
        "manage-workspace": "Manage Workspace",
        "search-web": "Search Web",
        "run-code": "Analyze (Run Code)",
    };

    const formattedActions = selectedActions.map((action) => {
        return actionLabels[action] || action;
    });

    const actionsList = formattedActions.map((action, index) => `${index + 1}. ${action}`).join("\n");

    return `<instructions>

Selected Actions:
The user has selected ${selectedActions.length} action${selectedActions.length !== 1 ? 's' : ''} in the actions menu:

${actionsList}

These actions are currently active. Consider them when responding to queries or performing operations.

</instructions>`;
}

/**
 * Formats flashcard details with FULL content
 */
function formatFlashcardDetailsFull(data: FlashcardData): string[] {
    const lines: string[] = [];

    // Handle migration case or legacy single card
    let cards: FlashcardItem[] = [];
    if (data.cards && data.cards.length > 0) {
        cards = data.cards;
    } else if (data.front || data.back || data.frontBlocks || data.backBlocks) {
        // Construct single legacy card
        cards = [{
            id: 'legacy',
            front: data.front || '',
            back: data.back || '',
            frontBlocks: data.frontBlocks,
            backBlocks: data.backBlocks
        }];
    }

    if (cards.length === 0) {
        lines.push("   - (Empty Flashcard Deck)");
        return lines;
    }

    lines.push(`   - Flashcard Deck (${cards.length} cards):`);

    cards.forEach((card, i) => {
        lines.push("");
        lines.push(`   [Card ${i + 1}]`);

        // Front
        const frontContent = card.frontBlocks
            ? serializeBlockNote(card.frontBlocks as Block[])
            : card.front;

        if (frontContent) {
            lines.push(`   FRONT:`);
            // Indent content for readability
            lines.push(frontContent.split('\n').map(l => `      ${l}`).join('\n'));
        }

        // Back
        const backContent = card.backBlocks
            ? serializeBlockNote(card.backBlocks as Block[])
            : card.back;

        if (backContent) {
            lines.push(`   BACK:`);
            lines.push(backContent.split('\n').map(l => `      ${l}`).join('\n'));
        }
    });

    return lines;
}

/**
 * Formats quiz details with FULL content
 */
function formatQuizDetailsFull(data: QuizData): string[] {
    const lines: string[] = [];
    const questions: QuizQuestion[] = data.questions || [];
    const session = data.session;
    const totalQuestions = questions.length;

    const answered = session?.answeredQuestions || [];
    const answeredCount = answered.length;

    // Determine completion status:
    // 1. All questions answered (answeredCount >= totalQuestions)
    // 2. OR completedAt exists AND most questions answered (handles race condition)
    //    But NOT if many questions were added after completion (answeredCount << totalQuestions)
    const hasCompletedAt = !!session?.completedAt;
    const mostQuestionsAnswered = answeredCount >= totalQuestions - 1; // Allow for off-by-one race
    const questionsWereAdded = hasCompletedAt && answeredCount < totalQuestions * 0.9; // More than 10% new questions

    const isCompleted = totalQuestions > 0 && (
        answeredCount >= totalQuestions ||  // All answered
        (hasCompletedAt && mostQuestionsAnswered && !questionsWereAdded)  // Has completedAt, almost done, no new Qs
    );
    const isNotStarted = answeredCount === 0;

    let status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
    if (isCompleted) {
        status = "COMPLETED";
    } else if (isNotStarted) {
        status = "NOT_STARTED";
    } else {
        status = "IN_PROGRESS";
    }

    lines.push(`STATUS: ${status}`);

    let correctCount = 0;
    let incorrectCount = 0;
    if (answeredCount > 0) {
        correctCount = answered.filter(a => a.isCorrect).length;
        incorrectCount = answeredCount - correctCount;
    }

    if (status === "NOT_STARTED") {
        lines.push(`   - Questions: ${totalQuestions}`);
        lines.push(`   - Difficulty: ${data.difficulty || "Medium"}`);
        if (data.sourceCardNames?.length) {
            lines.push(`   - Source: "${data.sourceCardNames.join('", "')}"`);
        }
    } else if (status === "IN_PROGRESS") {
        const rawIndex = session?.currentIndex ?? answeredCount;
        const currentIndex = totalQuestions > 0 ? Math.min(Math.max(rawIndex, 0), totalQuestions - 1) : 0;
        lines.push(`   - Question: ${totalQuestions > 0 ? currentIndex + 1 : 0} of ${totalQuestions}`);
        lines.push(`   - Score: ${correctCount} correct, ${incorrectCount} incorrect (${answeredCount} answered)`);
    } else {
        // COMPLETED
        const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
        lines.push(`   - Final Score: ${correctCount}/${totalQuestions} (${percentage}%)`);
        lines.push(`   - Difficulty: ${data.difficulty || "Medium"}`);
    }

    // Only show answered questions list for COMPLETED status
    if (status === "COMPLETED" && answeredCount > 0) {
        lines.push("");
        lines.push("ALL ANSWERS:");

        const answeredMap = new Map<string, boolean>();
        answered.forEach(a => answeredMap.set(a.questionId, a.isCorrect));

        questions.forEach((q, i) => {
            const isCorrect = answeredMap.get(q.id);
            const marker = isCorrect === true ? "✓" : isCorrect === false ? "✗" : "-";
            lines.push(`   ${i + 1}. ${marker} ${truncateText(q.questionText, 60)}`);
        });
    }

    // Show current question for NOT_STARTED and IN_PROGRESS
    if (status !== "COMPLETED") {
        const rawIndex = session?.currentIndex ?? 0;
        const currentIndex = totalQuestions > 0 ? Math.min(Math.max(rawIndex, 0), totalQuestions - 1) : 0;
        const currentQ = questions[currentIndex];
        if (currentQ) {
            lines.push("");
            lines.push("CURRENT QUESTION:");
            lines.push(`   ${currentIndex + 1}. ${currentQ.questionText}`);
            currentQ.options.forEach((opt, i) => {
                lines.push(`      ${String.fromCharCode(65 + i)}) ${opt}`);
            });
        }
    }

    return lines;
}
