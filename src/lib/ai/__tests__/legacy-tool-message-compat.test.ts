import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { normalizeLegacyToolMessages } from "../legacy-tool-message-compat";

describe("normalizeLegacyToolMessages", () => {
  it("normalizes legacy processUrls jsonInput tool args and drops instruction", () => {
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
      type: "tool-web_fetch",
      input: {
        urls: ["https://example.com"],
      },
    });
  });

  it("normalizes legacy webSearch string outputs", () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-webSearch",
            toolCallId: "call_3",
            state: "output-available",
            input: { query: "latest AI news" },
            output: JSON.stringify({
              text: "Summary text",
              sources: [{ title: "Example", url: "https://example.com" }],
              groundingMetadata: {
                groundingChunks: [
                  { web: { uri: "https://example.com", title: "Example" } },
                ],
              },
            }),
          },
        ],
      },
    ] as UIMessage[];

    const normalized = normalizeLegacyToolMessages(messages);
    const part = normalized[0]?.parts[0];

    expect(part).toMatchObject({
      type: "tool-web_search",
      output: {
        text: "Summary text",
        sources: [{ title: "Example", url: "https://example.com" }],
      },
    });
  });

  it("normalizes legacy webSearch string outputs without sources", () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-webSearch",
            toolCallId: "call_4",
            state: "output-available",
            input: { query: "latest AI news" },
            output: JSON.stringify({
              text: "Summary text",
              groundingMetadata: {
                groundingChunks: [
                  { web: { uri: "https://example.com", title: "Example" } },
                ],
              },
            }),
          },
        ],
      },
    ] as UIMessage[];

    const normalized = normalizeLegacyToolMessages(messages);
    const part = normalized[0]?.parts[0];

    expect(part).toMatchObject({
      type: "tool-web_search",
      output: {
        text: "Summary text",
        sources: [],
      },
    });
  });

  it("leaves canonical snake_case tool part types unchanged", () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-workspace_read",
            toolCallId: "call_x",
            state: "input-available",
            input: { path: "a.md" },
          },
        ],
      },
    ] as UIMessage[];

    const normalized = normalizeLegacyToolMessages(messages);
    expect(normalized[0]?.parts[0]).toMatchObject({
      type: "tool-workspace_read",
      input: { path: "a.md" },
    });
  });

  it("maps intermediate snake read_workspace to workspace_read", () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-read_workspace",
            toolCallId: "call_y",
            state: "input-available",
            input: { path: "b.md" },
          },
        ],
      },
    ] as UIMessage[];

    const normalized = normalizeLegacyToolMessages(messages);
    expect(normalized[0]?.parts[0]).toMatchObject({
      type: "tool-workspace_read",
      input: { path: "b.md" },
    });
  });
});
