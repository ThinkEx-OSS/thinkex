import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { normalizeLegacyToolMessages } from "../legacy-tool-message-compat";

describe("normalizeLegacyToolMessages", () => {
  it("normalizes legacy processUrls jsonInput tool args", () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-processUrls",
            toolCallId: "call_1",
            state: "input-available",
            input: {
              jsonInput: JSON.stringify({
                urls: ["https://example.com"],
                instruction: "Extract dates.",
              }),
            },
          },
        ],
      },
    ] as UIMessage[];

    const normalized = normalizeLegacyToolMessages(messages);
    const part = normalized[0]?.parts[0];

    expect(part).toMatchObject({
      type: "tool-processUrls",
      input: {
        urls: ["https://example.com"],
        instruction: "Extract dates.",
      },
    });
  });

  it("normalizes legacy executeCode object outputs", () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-executeCode",
            toolCallId: "call_2",
            state: "output-available",
            input: { task: "Compute fibonacci." },
            output: { text: "The answer is 6765." },
          },
        ],
      },
    ] as UIMessage[];

    const normalized = normalizeLegacyToolMessages(messages);
    const part = normalized[0]?.parts[0];

    expect(part).toMatchObject({
      type: "tool-executeCode",
      output: "The answer is 6765.",
    });
  });
});
