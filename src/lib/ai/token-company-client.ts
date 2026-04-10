import { TokenClient } from "tokenc";
import { logger } from "@/lib/utils/logger";

export interface CompressResult {
  output: string;
  originalTokens: number;
  compressedTokens: number;
}

let _client: TokenCompanyClient | null = null;
let _warnedOnce = false;

class TokenCompanyClient {
  private client: TokenClient | null;

  constructor() {
    const apiKey = process.env.TOKEN_COMPANY_API_KEY;
    if (!apiKey) {
      if (!_warnedOnce) {
        logger.debug(
          "🔧 [TTC] No TOKEN_COMPANY_API_KEY — compression disabled.",
        );
        _warnedOnce = true;
      }
      this.client = null;
      return;
    }
    this.client = new TokenClient({ apiKey, timeout: 5_000 });
  }

  get isEnabled(): boolean {
    return this.client !== null;
  }

  async compress(
    input: string,
    aggressiveness = 0.05,
  ): Promise<CompressResult | null> {
    if (!this.client || !input.trim()) return null;
    try {
      const response = await this.client.compressInput({
        input,
        model: "bear-1.2",
        aggressiveness,
      });
      if (response.outputTokens >= response.originalInputTokens) return null;
      return {
        output: response.output,
        originalTokens: response.originalInputTokens,
        compressedTokens: response.outputTokens,
      };
    } catch (error) {
      logger.warn("⚠️ [TTC] Compression failed, using original text:", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

export function getTokenCompanyClient(): TokenCompanyClient {
  if (!_client) {
    _client = new TokenCompanyClient();
  }
  return _client;
}
