import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { QuizQuestion, QuestionType } from "@/lib/workspace-state/types";
import { generateItemId } from "@/lib/workspace-state/item-helpers";

const DEFAULT_CHAT_MODEL_ID = "gemini-2.5-flash-lite";

export type QuizWorkerParams = {
    topic?: string;                // Used only if no context provided
    contextContent?: string;       // Aggregated content from selected cards
    sourceCardIds?: string[];
    sourceCardNames?: string[];
    difficulty: "easy" | "medium" | "hard";
    questionCount?: number;        // Defaults to 5
    questionTypes?: ("multiple_choice" | "true_false")[];
    existingQuestions?: Array<{
        id: string;
        questionText: string;
        correctIndex: number;
    }>;
    performanceTelemetry?: {
        totalAnswered: number;
        correctCount: number;
        incorrectCount: number;
        weakAreas?: Array<{
            questionText: string;
            userSelectedOption: string;
            correctOption: string;
        }>;
    };
};

function buildAdaptiveInstructions(
    baseDifficulty: "easy" | "medium" | "hard",
    telemetry?: QuizWorkerParams["performanceTelemetry"]
): string {
    if (!telemetry || telemetry.totalAnswered === 0) {
        return `- Difficulty: ${baseDifficulty.toUpperCase()}`;
    }

    const successRate = telemetry.totalAnswered > 0
        ? telemetry.correctCount / telemetry.totalAnswered
        : 0;

    let adjustedDifficulty: "easy" | "medium" | "hard";
    let cognitiveLevel: string;

    if (successRate >= 0.8) {
        adjustedDifficulty = baseDifficulty === "hard" ? "hard" : baseDifficulty === "medium" ? "hard" : "medium";
        cognitiveLevel = "Analysis and synthesis - test deeper understanding";
    } else if (successRate >= 0.5) {
        adjustedDifficulty = baseDifficulty;
        cognitiveLevel = "Application - focus on practical usage";
    } else {
        adjustedDifficulty = baseDifficulty === "easy" ? "easy" : baseDifficulty === "medium" ? "easy" : "medium";
        cognitiveLevel = "Recall and understanding - reinforce fundamentals";
    }

    let instructions = `- Adaptive Difficulty: ${adjustedDifficulty.toUpperCase()} (adjusted from ${baseDifficulty})
- User Performance: ${Math.round(successRate * 100)}% correct (${telemetry.correctCount}/${telemetry.totalAnswered})
- Cognitive Level: ${cognitiveLevel}`;

    if (telemetry.weakAreas && telemetry.weakAreas.length > 0 && successRate < 0.7) {
        instructions += `
LEARNING GAPS DETECTED - Include scaffolding questions for these weak areas:
${telemetry.weakAreas.slice(0, 3).map((w, i) =>
            `${i + 1}. Topic: "${w.questionText.substring(0, 50)}..." - User confused "${w.userSelectedOption}" with "${w.correctOption}"`
        ).join('\n')}
For weak areas:
- Include 2-3 foundational questions that build up to the concept
- Add extra hints for these topics
- Break complex concepts into smaller parts`;
    }

    return instructions;
}

export async function quizWorker(params: QuizWorkerParams): Promise<{ questions: QuizQuestion[]; title: string }> {
    try {
        const questionCount = params.questionCount || 5;
        const questionTypes = params.questionTypes || ["multiple_choice", "true_false"];

        logger.debug("🎯 [QUIZ-WORKER] Starting quiz generation:", {
            hasContext: !!params.contextContent,
            hasTopic: !!params.topic,
            difficulty: params.difficulty,
            questionCount,
            questionTypes,
        });

        // Build the prompt based on whether we have context or topic
        let prompt: string;
        const adaptiveInstructions = buildAdaptiveInstructions(params.difficulty, params.performanceTelemetry);

        if (params.contextContent) {
            // Context-based quiz generation
            prompt = `You are a quiz generator. Create exactly ${questionCount} quiz questions based EXCLUSIVELY on the following content. Do NOT use any external knowledge.

IMPORTANT: The content below is from workspace cards and includes metadata headers like "CARD 1:", "Card ID:", "METADATA:", "CONTENT:", etc. IGNORE ALL METADATA. Focus ONLY on the actual educational content within each card - the text, concepts, facts, and information being taught. Do NOT create questions about:
- Card IDs, card types, or card names
- Metadata like "Type: note" or "Card ID: xyz"
- System formatting like separators, emojis, or structural markers
- The number of cards, questions, or any organizational details

CONTENT TO QUIZ ON:
${params.contextContent}

REQUIREMENTS:
${adaptiveInstructions}
- Difficulty guide:
  - Easy: Basic recall and recognition questions
  - Medium: Understanding and application questions  
  - Hard: Analysis, synthesis, and critical thinking questions
- Question types allowed: ${questionTypes.join(", ")}
- For multiple_choice: provide exactly 4 options with only 1 correct answer
- For true_false: provide exactly 2 options (["True", "False"])
- Each question must have a clear, specific explanation
- Each question should optionally have a helpful hint
- Questions must be directly answerable from the provided EDUCATIONAL content (not metadata)

SOURCE: ${params.sourceCardNames?.join(", ") || "Selected content"}`;
        } else if (params.topic) {
            // Topic-based quiz generation from LLM knowledge
            prompt = `You are a quiz generator. Create exactly ${questionCount} quiz questions about: ${params.topic}

REQUIREMENTS:
${adaptiveInstructions}
- Difficulty guide:
  - Easy: Basic facts and definitions
  - Medium: Understanding concepts and relationships
  - Hard: Complex analysis and application
- Question types allowed: ${questionTypes.join(", ")}
- For multiple_choice: provide exactly 4 options with only 1 correct answer
- For true_false: provide exactly 2 options (["True", "False"])
- Each question must have a clear, specific explanation
- Each question should optionally have a helpful hint
- Questions should cover diverse aspects of the topic`;
        } else {
            throw new Error("Either topic or contextContent must be provided");
        }

        if (params.existingQuestions && params.existingQuestions.length > 0) {
            prompt += `

EXISTING QUESTIONS (DO NOT DUPLICATE):
The following ${params.existingQuestions.length} questions already exist. Generate NEW questions that:
1. Cover DIFFERENT aspects of the topic
2. Do NOT ask the same thing with different wording
3. Do NOT repeat any correct answers
Existing questions to avoid:
${params.existingQuestions.map((q, i) => `${i + 1}. ${q.questionText}`).join('\n')}`;
        }

        prompt += `

OUTPUT FORMAT (strict JSON):
{
  "title": "Quiz Title",
  "questions": [
    {
      "id": "q_001",
      "type": "multiple_choice",
      "questionText": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "hint": "Optional hint text",
      "explanation": "Explanation here",
      "sourceContext": "Excerpt from source if applicable",
      "question_text": "Legacy mapping",
      "correct_index": "Legacy mapping"
    }
  ]
}

For true_false questions, options should be exactly ["True", "False"] and correctIndex 0 for True, 1 for False.`;

        // Use structured output generation for better reliability
        const { output: quizData } = await generateText({
            // Match the default chat model (see `src/app/api/chat/route.ts`)
            model: google(DEFAULT_CHAT_MODEL_ID),
            output: Output.object({
                name: "Quiz",
                description: "A generated quiz with title and questions",
                schema: z.object({
                    title: z.string().describe("A short, descriptive title for the quiz"),
                    questions: z.array(
                        z.object({
                            id: z.string().describe("Unique identifier for the question"),
                            type: z.enum(["multiple_choice", "true_false"]).describe("Type of question"),
                            questionText: z.string().describe("The question text"),
                            options: z.array(z.string()).describe("Answer options - 4 for multiple choice, 2 for true/false"),
                            correctIndex: z.number().describe("Index of the correct answer in options array"),
                            hint: z.string().optional().describe("Optional hint for the question"),
                            explanation: z.string().describe("Explanation of why the answer is correct"),
                            sourceContext: z.string().optional().describe("Source context if applicable"),
                        })
                    ).describe("Array of quiz questions"),
                }),
            }),
            prompt,
        });

        // Transform questions - ALWAYS generate new unique IDs
        // to prevent collisions when adding questions to existing quizzes
        const questions: QuizQuestion[] = quizData.questions.map((q) => ({
            id: generateItemId(), // Always use unique ID
            type: q.type as QuestionType,
            questionText: q.questionText,
            options: q.options || [],
            correctIndex: q.correctIndex ?? 0,
            hint: q.hint,
            explanation: q.explanation || "No explanation provided.",
        }));

        logger.debug("🎯 [QUIZ-WORKER] Generated quiz:", {
            title: quizData.title,
            questionCount: questions.length,
        });

        return {
            title: quizData.title || params.topic || "Generated Quiz",
            questions,
        };
    } catch (error) {
        logger.error("🎯 [QUIZ-WORKER] Error:", error);
        throw error;
    }
}
