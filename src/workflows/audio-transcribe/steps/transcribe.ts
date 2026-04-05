import {
  GoogleGenAI,
  Type,
  createPartFromUri,
  createUserContent,
} from "@google/genai";

export interface TranscribeResult {
  summary: string;
  segments: Array<{ speaker: string; timestamp: string; content: string }>;
  duration?: number;
}

/**
 * Step: Call Gemini to transcribe audio and generate summary + segments.
 */
export async function transcribeWithGemini(
  fileUri: string,
  mimeType: string
): Promise<TranscribeResult> {
  "use step";

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
  }

  const client = new GoogleGenAI({ apiKey });

  const prompt = `Process this audio file and generate a detailed transcription and summary.

Requirements:
1. Provide a comprehensive summary of the entire audio content.
2. Identify distinct speakers (e.g., Speaker 1, Speaker 2, or names if context allows).
3. Provide accurate timestamps for each segment (Format: MM:SS).
4. Provide the total duration of the audio in seconds (a single number, e.g. 180.5 for 3 minutes).`;

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(fileUri, mimeType),
      prompt,
    ]),
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: "A concise summary of the audio content.",
          },
          duration: {
            type: Type.NUMBER,
            description: "Total duration of the audio in seconds.",
          },
          segments: {
            type: Type.ARRAY,
            description:
              "List of transcribed segments with speaker and timestamp.",
            items: {
              type: Type.OBJECT,
              properties: {
                speaker: { type: Type.STRING },
                timestamp: { type: Type.STRING },
                content: { type: Type.STRING },
              },
              required: ["speaker", "timestamp", "content"],
            },
          },
        },
        required: ["summary", "segments"],
      },
    },
  });

  const resultText = response.text;
  if (!resultText) {
    throw new Error("No response from Gemini");
  }

  const result = JSON.parse(resultText) as {
    summary: string;
    segments: Array<{ speaker: string; timestamp: string; content: string }>;
    duration?: number;
  };

  return {
    summary: result.summary,
    segments: result.segments,
    duration:
      typeof result.duration === "number" && result.duration > 0
        ? result.duration
        : undefined,
  };
}
