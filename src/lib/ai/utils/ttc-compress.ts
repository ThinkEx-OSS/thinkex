import { gzipSync } from "node:zlib";

const TTC_COMPRESS_ENDPOINT = "https://api.thetokencompany.com/v1/compress";
const TTC_MODEL = "bear-1.2";
const TTC_AGGRESSIVENESS = 0.1;
const TTC_MIN_CHARS_TO_COMPRESS = 120;

type TtcCompressResponse = {
  output?: unknown;
};

export async function compressTextWithTTC(input: string): Promise<string> {
  const apiKey = process.env.TTC_API_KEY;

  if (!apiKey || !input.trim()) {
    return input;
  }

  if (input.trim().length < TTC_MIN_CHARS_TO_COMPRESS) {
    return input;
  }

  try {
    const payload = JSON.stringify({
      input,
      model: TTC_MODEL,
      compression_settings: {
        aggressiveness: TTC_AGGRESSIVENESS,
      },
    });

    const response = await fetch(TTC_COMPRESS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      },
      body: gzipSync(payload),
    });

    if (!response.ok) {
      return input;
    }

    const data = (await response.json()) as TtcCompressResponse;

    if (typeof data.output === "string" && data.output.trim().length > 0) {
      return data.output;
    }

    return input;
  } catch {
    // Fail open: if compression fails, continue with original prompt.
    return input;
  }
}
