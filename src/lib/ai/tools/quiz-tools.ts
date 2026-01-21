/**
 * Quiz Tools
 * Tools for creating and updating quizzes in workspaces
 */

import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { quizWorker, workspaceWorker } from "@/lib/ai/workers";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import type { WorkspaceToolContext } from "./workspace-tools";
import type { QuizData } from "@/lib/workspace-state/types";

/**
 * Extract content from selected cards context
 * Returns null if no cards are selected (the marker contains "NO CARDS SELECTED")
 */
function extractSelectedCardsContext(text: string) {
    const marker = "[[SELECTED_CARDS_MARKER]]";
    const match = text.match(new RegExp(`${marker}([\\s\\S]*?)${marker}`));
    if (!match) return null;

    const rawContext = match[1];

    // Check if this is the "no cards selected" case
    // When no cards are selected, formatSelectedCardsContext returns:
    // "<context>\nNO CARDS SELECTED.\n..."
    if (rawContext.includes("NO CARDS SELECTED")) {
        logger.debug("🎯 [EXTRACT-CONTEXT] No cards selected, returning null");
        return null;
    }

    // Extract card names and IDs
    const nameMatches = rawContext.matchAll(/CARD\s+\d+:\s+.*"([^"]+)"/g);
    const idMatches = rawContext.matchAll(/Card ID:\s*([a-zA-Z0-9_-]+)/g);
    const names = Array.from(nameMatches).map(m => m[1]);
    const ids = Array.from(idMatches).map(m => m[1]);

    // If we don't find any card IDs, there are no actual cards selected
    if (ids.length === 0) {
        logger.debug("🎯 [EXTRACT-CONTEXT] No card IDs found in context, returning null");
        return null;
    }

    // Extract ONLY the actual content, not metadata
    const contentSections: string[] = [];
    const cardBlocks = rawContext.split(/━+/);

    for (const block of cardBlocks) {
        const contentMatch = block.match(/📄 CONTENT:\s*([\s\S]*?)(?=🔧 METADATA:|$)/);
        if (contentMatch && contentMatch[1]) {
            let content = contentMatch[1].trim();
            content = content.replace(/^\s*-\s*Content:\s*/i, '');
            content = content.replace(/^\s{2,}/gm, '');
            if (content && content.length > 10) {
                const cardNameMatch = block.match(/CARD\s+\d+:\s+[^\[]*\[([^\]]+)\]\s+"([^"]+)"/);
                if (cardNameMatch) {
                    contentSections.push(`## ${cardNameMatch[2]}\n${content}`);
                } else {
                    contentSections.push(content);
                }
            }
        }
    }

    let cleanedContext = contentSections.length > 0
        ? contentSections.join('\n\n')
        : rawContext
            .replace(/CARD\s+\d+:.*$/gm, '')
            .replace(/⚡ Card ID:.*$/gm, '')
            .replace(/🔧 METADATA:[\s\S]*?(?=CARD|$)/g, '')
            .replace(/📄 CONTENT:/g, '')
            .replace(/━+/g, '')
            .replace(/Card ID:\s*[a-zA-Z0-9_-]+/g, '')
            .replace(/Type:\s*\w+/g, '')
            .trim();

    // Final check: if cleanedContext is empty or too short, return null
    if (!cleanedContext || cleanedContext.length < 20) {
        logger.debug("🎯 [EXTRACT-CONTEXT] Cleaned context too short, returning null");
        return null;
    }

    return { context: cleanedContext, names, ids };
}

/**
 * Extract the user's latest message content to use as topic source
 * This captures what the user actually asked for when creating/updating a quiz
 */
function extractUserMessage(messages: any[]): string | undefined {
    // Find the last user message (most recent request)
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'user') {
            if (typeof msg.content === 'string') {
                // Remove any card markers and clean up
                return cleanMessageForTopic(msg.content);
            } else if (Array.isArray(msg.content)) {
                // Handle multi-part messages
                for (const part of msg.content) {
                    if (part.type === 'text' && typeof part.text === 'string') {
                        return cleanMessageForTopic(part.text);
                    }
                }
            }
        }
    }
    return undefined;
}

/**
 * Clean a message to extract the topic intent
 * Removes card markers, file markers, and other metadata
 */
function cleanMessageForTopic(text: string): string {
    // Remove SELECTED_CARDS_MARKER blocks
    const cardsMarker = "[[SELECTED_CARDS_MARKER]]";
    let cleaned = text.replace(new RegExp(`${cardsMarker}[\\s\\S]*?${cardsMarker}`, 'g'), '');

    // Remove FILE_URL markers
    cleaned = cleaned.replace(/\[FILE_URL:[^\]]+\]/g, '');

    // Remove URL_CONTEXT markers
    cleaned = cleaned.replace(/\[URL_CONTEXT:[^\]]+\]/g, '');

    // Trim and return
    return cleaned.trim();
}

/**
 * Create the createQuiz tool
 */
export function createQuizTool(ctx: WorkspaceToolContext, convertedMessages: any[]) {
    return {
        description: "Create an interactive quiz in the workspace. Generates multiple-choice and true/false questions. If cards are selected in the context drawer, questions are generated EXCLUSIVELY from that content. If no context is selected, generates questions from general knowledge about the topic the user specified in their message. Creates a quiz card with 10 questions that the user can take interactively. IMPORTANT: When calling this tool, you MUST extract the topic from the user's message and pass it as the 'topic' parameter.",
        // Use z.any() to avoid streaming validation errors when Gemini sends properties in random order
        // The error "argsText can only be appended" happens because strict z.object() validates during streaming
        inputSchema: z.any().describe("Object with 'topic' (string - REQUIRED: extract from user's message what they want the quiz to be about) and optional 'difficulty' ('easy'|'medium'|'hard', default 'medium')"),
        execute: async (args: unknown) => {
            // Manually extract and validate args since we're using z.any()
            const parsedArgs = args as { topic?: string; difficulty?: string } | null;
            let topic = parsedArgs?.topic;
            const difficulty = (parsedArgs?.difficulty as "easy" | "medium" | "hard") || "medium";
            logger.debug("🎯 [CREATE-QUIZ] Tool execution started:", { topic, difficulty });

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            try {
                // Check if we have context from selected cards
                let contextContent: string | undefined;
                let sourceCardIds: string[] | undefined;
                let sourceCardNames: string[] | undefined;

                for (const msg of convertedMessages) {
                    if (typeof msg.content === "string") {
                        const extracted = extractSelectedCardsContext(msg.content);
                        if (extracted && extracted.context) {
                            contextContent = extracted.context;
                            sourceCardNames = extracted.names;
                            sourceCardIds = extracted.ids;
                            break;
                        }
                    } else if (Array.isArray(msg.content)) {
                        for (const part of msg.content) {
                            if (part.type === "text" && typeof part.text === "string") {
                                const extracted = extractSelectedCardsContext(part.text);
                                if (extracted && extracted.context) {
                                    contextContent = extracted.context;
                                    sourceCardNames = extracted.names;
                                    sourceCardIds = extracted.ids;
                                    break;
                                }
                            }
                        }
                        if (contextContent) break;
                    }
                }

                // If no context from cards and no explicit topic, extract from user's message
                if (!contextContent && !topic) {
                    const userMessage = extractUserMessage(convertedMessages);
                    if (userMessage) {
                        topic = userMessage;
                        logger.debug("🎯 [CREATE-QUIZ] Using user message as topic:", { topic });
                    }
                }

                logger.debug("🎯 [CREATE-QUIZ] Context extracted:", {
                    hasContext: !!contextContent,
                    contextLength: contextContent?.length,
                    sourceCardNames,
                    sourceCardIds,
                    providedTopic: topic,
                });

                // Generate quiz using quizWorker
                const quizResult = await quizWorker({
                    topic: topic || undefined,
                    contextContent,
                    difficulty,
                    questionCount: 10,
                    sourceCardIds,
                    sourceCardNames,
                });

                logger.debug("🎯 [CREATE-QUIZ] quizWorker returned:", {
                    title: quizResult.title,
                    questionCount: quizResult.questions?.length,
                });

                // Create quiz item in workspace
                const workerResult = await workspaceWorker("create", {
                    workspaceId: ctx.workspaceId,
                    title: quizResult.title,
                    itemType: "quiz",
                    quizData: {
                        questions: quizResult.questions,
                        difficulty,
                        sourceCardIds,
                        sourceCardNames,
                    },
                    folderId: ctx.activeFolderId,
                });

                return {
                    success: true,
                    quizId: workerResult.itemId,
                    title: quizResult.title,
                    questionCount: quizResult.questions.length,
                    difficulty,
                    isContextBased: !!contextContent,
                    message: `Created quiz "${quizResult.title}" with ${quizResult.questions.length} questions.`,
                };
            } catch (error) {
                logger.error("❌ [CREATE-QUIZ] Error:", error);
                return {
                    success: false,
                    message: `Error creating quiz: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    };
}

/**
 * Create the updateQuiz tool
 */
export function createUpdateQuizTool(ctx: WorkspaceToolContext, convertedMessages: any[]) {
    return {
        description: "Add more questions to an existing quiz. This tool can generate questions based on: 1) The user's performance history (weak areas), 2) A new topic the user specifies, or 3) General knowledge continuation. It should be called when the user asks to 'continue the quiz', 'add more questions', 'practice my weak areas', or 'add questions about [topic]'. IMPORTANT: If the user specifies a new topic for the additional questions, you MUST pass it as the 'topic' parameter.",
        // Use z.any() to avoid streaming validation errors when Gemini sends properties in random order
        // The error "argsText can only be appended" happens because strict z.object() validates during streaming
        inputSchema: z.any().describe("Object with 'quizId' (string - REQUIRED: ID of the quiz to update) and optional 'topic' (string - if user specifies a new topic for additional questions)"),
        execute: async (args: unknown) => {
            // Manually extract and validate args since we're using z.any()
            const parsedArgs = args as { quizId?: string; topic?: string } | null;
            const quizId = parsedArgs?.quizId;
            const explicitTopic = parsedArgs?.topic;

            logger.debug("🎯 [UPDATE-QUIZ] Tool execution started:", { quizId, explicitTopic });

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            // Validate required quizId
            if (!quizId) {
                return {
                    success: false,
                    message: "Quiz ID is required. Please select a quiz card to update.",
                };
            }

            try {
                // Load current workspace state to find the quiz
                const state = await loadWorkspaceState(ctx.workspaceId);
                const quizItem = state.items.find(item => item.id === quizId);

                if (!quizItem || quizItem.type !== 'quiz') {
                    logger.warn("❌ [UPDATE-QUIZ] Quiz not found:", {
                        searchedId: quizId,
                        availableIds: state.items.filter(i => i.type === 'quiz').map(i => i.id)
                    });
                    return {
                        success: false,
                        message: "Quiz not found. Please select a quiz card in the context drawer.",
                    };
                }

                const currentQuizData = quizItem.data as QuizData;
                const existingQuestions = currentQuizData.questions || [];
                const session = currentQuizData.session;

                logger.debug("✅ [UPDATE-QUIZ] Found quiz:", {
                    id: quizItem.id,
                    name: quizItem.name,
                    questionCount: existingQuestions.length,
                    hasSession: !!session,
                    answeredCount: session?.answeredQuestions?.length,
                });

                // Build performance telemetry from answered questions
                let performanceTelemetry;
                if (session?.answeredQuestions && session.answeredQuestions.length > 0) {
                    const weakAreas = session.answeredQuestions
                        .filter(a => !a.isCorrect)
                        .map(a => {
                            const question = existingQuestions.find(q => q.id === a.questionId);
                            return question ? {
                                questionId: a.questionId,
                                questionText: question.questionText,
                                userSelectedOption: question.options?.[a.userAnswer] || "Unknown",
                                correctOption: question.options?.[question.correctIndex] || "Unknown",
                            } : null;
                        })
                        .filter((x): x is NonNullable<typeof x> => x !== null);

                    const correctCount = session.answeredQuestions.filter(a => a.isCorrect).length;
                    performanceTelemetry = {
                        correctCount,
                        incorrectCount: session.answeredQuestions.length - correctCount,
                        totalAnswered: session.answeredQuestions.length,
                        weakAreas,
                    };
                }

                // 3-MODE UPDATE LOGIC
                // 1. Context Update: User selected NEW cards (e.g. A,B -> C,D)
                // 2. Pivot: User specified NEW topic (no cards)
                // 3. Continue: User wants more of the same (original topic/context)

                // Step 1: Check for NEW selected cards context
                // We need to look at the last user message to see if there's context attached
                let newContextContent: string | undefined;
                let newSourceCardIds: string[] = [];
                let newSourceCardNames: string[] = [];

                // Find the last user message with context
                for (let i = convertedMessages.length - 1; i >= 0; i--) {
                    const msg = convertedMessages[i];
                    if (msg.role === 'user') {
                        let contentToScan = "";
                        if (typeof msg.content === 'string') {
                            contentToScan = msg.content;
                        } else if (Array.isArray(msg.content)) {
                            contentToScan = msg.content.map((p: any) => p.text || "").join("\n");
                        }

                        const extracted = extractSelectedCardsContext(contentToScan);
                        if (extracted) {
                            newContextContent = extracted.context;
                            newSourceCardIds = extracted.ids;
                            newSourceCardNames = extracted.names;
                            break; // specific context found
                        }
                    }
                }

                let quizTopic = explicitTopic;
                let contextForWorker: string | undefined;
                let sourceCardIdsForWorker: string[] | undefined;
                let sourceCardNamesForWorker: string[] | undefined;

                if (newContextContent && newSourceCardIds.length > 0) {
                    // MODE 1: CONTEXT UPDATE
                    // User selected specific cards - start fresh with this context
                    logger.debug("🎯 [UPDATE-QUIZ] Mode: CONTEXT UPDATE", { cards: newSourceCardNames });

                    contextForWorker = newContextContent;
                    sourceCardIdsForWorker = newSourceCardIds;
                    sourceCardNamesForWorker = newSourceCardNames;

                    // If no explicit topic, try to infer one or use "Updated content"
                    if (!quizTopic) {
                        const userMessage = extractUserMessage(convertedMessages);
                        quizTopic = userMessage || `Quiz on ${newSourceCardNames[0]}...`;
                    }

                } else if (quizTopic) {
                    // MODE 2: PIVOT (Explicit Topic + No Context)
                    // User wants to change variables/topic completely
                    logger.debug("🎯 [UPDATE-QUIZ] Mode: TOPIC PIVOT", { topic: quizTopic });

                    // Force context extracted from original quiz to be IGNORED
                    // We want general knowledge about the new topic
                    contextForWorker = undefined;
                    sourceCardIdsForWorker = undefined;

                } else {
                    // MODE 3: CONTINUE (No Topic + No New Context)
                    // Just add more of the same
                    logger.debug("🎯 [UPDATE-QUIZ] Mode: CONTINUATION");

                    // Use user message if present (e.g. "add more about history")
                    const userMessage = extractUserMessage(convertedMessages);
                    quizTopic = userMessage || quizItem.name;

                    // Reuse original source cards/context if available
                    // NOTE: We don't have the full extracted text of original cards stored, 
                    // mainly just IDs/Names. We pass a prompt instruction instead.
                    sourceCardIdsForWorker = currentQuizData.sourceCardIds;
                    sourceCardNamesForWorker = currentQuizData.sourceCardNames;

                    if (currentQuizData.sourceCardIds?.length) {
                        contextForWorker = `Continue generating questions about: ${quizTopic}. Maintain consistency with original source cards: ${currentQuizData.sourceCardNames?.join(", ")}`;
                    } else {
                        contextForWorker = undefined; // General knowledge continuation
                    }
                }

                logger.debug("🎯 [UPDATE-QUIZ] Final configuration:", {
                    mode: newContextContent ? "Context" : quizTopic ? "Pivot" : "Continue",
                    topic: quizTopic,
                    hasContext: !!contextForWorker,
                    sourceCards: sourceCardNamesForWorker
                });

                // Generate new questions
                const quizResult = await quizWorker({
                    topic: quizTopic,
                    contextContent: contextForWorker,
                    difficulty: currentQuizData.difficulty || "medium",
                    questionCount: 10,
                    existingQuestions,
                    performanceTelemetry,
                    sourceCardIds: sourceCardIdsForWorker,
                    sourceCardNames: sourceCardNamesForWorker
                });

                // Update the quiz with new questions
                // Cast to any since workspaceWorker internal types use questionsToAdd
                await workspaceWorker("updateQuiz", {
                    workspaceId: ctx.workspaceId,
                    itemId: quizId,
                    itemType: "quiz",
                    questionsToAdd: quizResult.questions,
                });

                return {
                    success: true,
                    quizId,
                    questionsAdded: quizResult.questions.length,
                    totalQuestions: existingQuestions.length + quizResult.questions.length,
                    message: `Added ${quizResult.questions.length} new questions to the quiz.`,
                };
            } catch (error) {
                logger.error("❌ [UPDATE-QUIZ] Error:", error);
                return {
                    success: false,
                    message: `Error updating quiz: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    };
}
