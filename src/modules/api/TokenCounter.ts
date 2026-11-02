import { ChatMessage, ContextItem } from "../../addon";

export class TokenCounter {
  // Regex matching CJK characters (Unified Ideographs, Kana, Hangul)
  private static readonly CJK_REGEX =
    /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af\uff00-\uffef]/g;

  /**
   * Fast and realistic token estimation for mixed CJK, English, and code.
   * Standard BPE tokenizers (like cl100k_base or Gemini/Claude) take:
   * - 1.3 ~ 1.5 tokens per CJK character
   * - 1 token per ~3.7 English characters (or ~1.3 tokens per whitespace-separated word)
   */
  public static estimateTokens(text: string): number {
    if (!text || text.length === 0) return 0;

    const cjkMatches = text.match(TokenCounter.CJK_REGEX);
    const cjkCount = cjkMatches ? cjkMatches.length : 0;

    // Remove CJK to evaluate remaining Latin / code text
    const nonCjkText = text.replace(TokenCounter.CJK_REGEX, " ").trim();
    let nonCjkTokens = 0;
    if (nonCjkText.length > 0) {
      // Approximate: 1 token ~= 3.8 characters for English/code
      nonCjkTokens = Math.ceil(nonCjkText.length / 3.8);
    }

    const cjkTokens = Math.ceil(cjkCount * 1.35);
    const total = cjkTokens + nonCjkTokens;
    return Math.max(1, total);
  }

  /**
   * Format token counts into human-readable strings (e.g., "48", "1.4k", "128k").
   */
  public static formatTokens(tokens: number): string {
    if (tokens < 1000) {
      return tokens.toString();
    } else if (tokens < 100000) {
      return (tokens / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    } else if (tokens < 1000000) {
      return Math.round(tokens / 1000) + "k";
    } else {
      return (tokens / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    }
  }

  /**
   * Get the maximum context window for the active model.
   */
  public static getContextCapacity(modelId: string): number {
    if (!modelId) return 200000;
    const lower = modelId.toLowerCase();
    if (lower.includes("gemini")) {
      return 1000000; // Gemini Flash / Pro context window
    }
    if (
      lower.includes("opus-5") ||
      lower.includes("sonnet-5") ||
      lower.includes("haiku-4") ||
      lower.includes("fable") ||
      lower.includes("mythos")
    ) {
      return 1000000; // 1M token context for next-gen models
    }
    return 200000; // Default 200k for Claude 3.5/3.7 models
  }

  /**
   * Calculate current total context usage including prompt template, context cards, history, and draft.
   */
  public static calculateUsage(
    systemPrompt: string,
    contexts: ContextItem[],
    messages: ChatMessage[],
    inputDraft: string,
    modelId: string,
  ): { total: number; capacity: number; percentage: number } {
    let total = TokenCounter.estimateTokens(systemPrompt);

    for (const ctx of contexts) {
      total += TokenCounter.estimateTokens(ctx.text) + 20; // context card overhead
    }

    for (const msg of messages) {
      if (typeof msg.tokens === "number" && msg.tokens > 0) {
        total += msg.tokens;
      } else {
        total += TokenCounter.estimateTokens(msg.content);
      }
    }

    if (inputDraft) {
      total += TokenCounter.estimateTokens(inputDraft);
    }

    const capacity = TokenCounter.getContextCapacity(modelId);
    const percentage = Math.min(100, Math.round((total / capacity) * 1000) / 10);

    return { total, capacity, percentage };
  }
}
