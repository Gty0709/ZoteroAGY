import { ClaudeClient } from "./ClaudeClient";
import { AGYClient } from "./AGYClient";
import { debugLog } from "../../hooks";

export interface QuotaState {
  weekPercent: number;
  weekResetsAt?: string;
  fiveHourPercent: number;
  fiveHourResetsAt?: string;
  lastUpdated: number;
  activeBackend: "agy" | "claude";
  category?: string;
}

export class QuotaManager {
  private static getPrefKey(): string {
    const prefix =
      typeof addon !== "undefined" && addon?.data?.config?.prefsPrefix
        ? addon.data.config.prefsPrefix
        : "extensions.zoteroagy";
    return `${prefix}.quotaState`;
  }

  public static getActiveEngine(): "agy" | "claude" {
    try {
      const prefix =
        typeof addon !== "undefined" && addon?.data?.config?.prefsPrefix
          ? addon.data.config.prefsPrefix
          : "extensions.zoteroagy";
      const saved = Zotero.Prefs.get(`${prefix}.activeEngine`, true) as string;
      if (saved === "claude" || saved === "agy") return saved;
    } catch (_) {}
    return (
      (typeof addon !== "undefined" && addon?.data?.chat?.activeEngine) || "agy"
    );
  }

  private static listeners: Set<(state: QuotaState) => void> = new Set();

  private static agyState: QuotaState = {
    weekPercent: 13,
    weekResetsAt: "周重置",
    fiveHourPercent: 38,
    fiveHourResetsAt: "5h重置",
    lastUpdated: Date.now(),
    activeBackend: "agy",
    category: "Gemini Models",
  };

  private static claudeState: QuotaState = {
    weekPercent: 41,
    weekResetsAt: "周重置",
    fiveHourPercent: 2,
    fiveHourResetsAt: "5h重置",
    lastUpdated: Date.now(),
    activeBackend: "claude",
    category: "Claude Code",
  };

  private static isInitialized = false;

  public static init(): void {
    if (QuotaManager.isInitialized) return;
    QuotaManager.isInitialized = true;
    try {
      const saved = Zotero.Prefs.get(QuotaManager.getPrefKey(), true) as string;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.agy) {
          QuotaManager.agyState = { ...QuotaManager.agyState, ...parsed.agy };
        }
        if (parsed.claude) {
          QuotaManager.claudeState = {
            ...QuotaManager.claudeState,
            ...parsed.claude,
          };
        }
      }
    } catch (_) {}
  }

  public static getState(engine?: "agy" | "claude"): QuotaState {
    QuotaManager.init();
    const active = engine || QuotaManager.getActiveEngine();
    return active === "claude"
      ? { ...QuotaManager.claudeState }
      : { ...QuotaManager.agyState };
  }

  public static addListener(fn: (state: QuotaState) => void): () => void {
    QuotaManager.listeners.add(fn);
    return () => QuotaManager.listeners.delete(fn);
  }

  private static notify(): void {
    const currentState = QuotaManager.getState();
    for (const fn of QuotaManager.listeners) {
      try {
        fn(currentState);
      } catch (e) {
        debugLog("QuotaManager notify error: " + e);
      }
    }
  }

  private static persist(): void {
    try {
      Zotero.Prefs.set(
        QuotaManager.getPrefKey(),
        JSON.stringify({
          agy: QuotaManager.agyState,
          claude: QuotaManager.claudeState,
        }),
        true,
      );
    } catch (_) {}
  }

  /**
   * Update Claude quota metrics from real-time stream event:
   * {"type":"rate_limit_event","rate_limit_info":{"unifiedWindows":{"five_hour":...,"seven_day":...}}}
   */
  public static updateFromRateLimit(rateLimitInfo: any): void {
    if (!rateLimitInfo) return;
    try {
      const windows = rateLimitInfo.unifiedWindows || {};
      const fiveHour = windows.five_hour;
      const sevenDay = windows.seven_day;

      let changed = false;

      if (fiveHour && typeof fiveHour.utilization === "number") {
        QuotaManager.claudeState.fiveHourPercent = Math.round(
          fiveHour.utilization * 100,
        );
        if (fiveHour.resetsAt) {
          QuotaManager.claudeState.fiveHourResetsAt =
            QuotaManager.formatResetTimestamp(fiveHour.resetsAt);
        }
        changed = true;
      }

      if (sevenDay && typeof sevenDay.utilization === "number") {
        QuotaManager.claudeState.weekPercent = Math.round(
          sevenDay.utilization * 100,
        );
        if (sevenDay.resetsAt) {
          QuotaManager.claudeState.weekResetsAt =
            QuotaManager.formatResetTimestamp(sevenDay.resetsAt);
        }
        changed = true;
      }

      if (changed) {
        QuotaManager.claudeState.lastUpdated = Date.now();
        QuotaManager.persist();
        QuotaManager.notify();
      }
    } catch (e: any) {
      debugLog("updateFromRateLimit error: " + e.message);
    }
  }

  /**
   * Parse textual usage output from claude /usage:
   * "Current session: 2% used · resets Nov 2, 3:59pm"
   * "Current week (all models): 41% used · resets Nov 7, 1:59am"
   */
  public static updateFromClaudeUsageText(text: string): void {
    if (!text) return;
    try {
      const sessionMatch = text.match(
        /Current session:\s*(\d+)%\s*used(?:\s*·\s*resets\s*([^)\n\r]+))?/i,
      );
      if (sessionMatch) {
        QuotaManager.claudeState.fiveHourPercent = parseInt(
          sessionMatch[1],
          10,
        );
        if (sessionMatch[2]) {
          QuotaManager.claudeState.fiveHourResetsAt = sessionMatch[2].trim();
        }
      }

      const weekMatch = text.match(
        /Current week[^:]*:\s*(\d+)%\s*used(?:\s*·\s*resets\s*([^)\n\r]+))?/i,
      );
      if (weekMatch) {
        QuotaManager.claudeState.weekPercent = parseInt(weekMatch[1], 10);
        if (weekMatch[2]) {
          QuotaManager.claudeState.weekResetsAt = weekMatch[2].trim();
        }
      }

      QuotaManager.claudeState.lastUpdated = Date.now();
      QuotaManager.persist();
      QuotaManager.notify();
    } catch (e: any) {
      debugLog("updateFromClaudeUsageText error: " + e.message);
    }
  }

  /**
   * Parse textual usage output from agy -p "/usage":
   * Gemini Models\tWeekly Limit Remaining\t87%\t2026-11-08T05:31:02Z
   * Gemini Models\tFive Hour Limit Remaining\t62%\t2026-11-02T06:44:02Z
   * Claude and GPT models\tWeekly Limit Remaining\t100%\t2026-11-09T05:56:11Z
   * Claude and GPT models\tFive Hour Limit Remaining\t100%\t2026-11-02T10:56:11Z
   */
  public static updateFromAgyUsageText(text: string): void {
    if (!text) return;
    try {
      const activeModel = AGYClient.getModel().toLowerCase();
      const isClaudeOrGpt =
        activeModel.includes("claude") || activeModel.includes("gpt");
      const targetCategory = isClaudeOrGpt
        ? "claude and gpt models"
        : "gemini models";

      const lines = text.split(/[\r\n]+/);
      let foundCategoryMatch = false;

      for (const line of lines) {
        const parts = line.split("\t").map((s) => s.trim());
        if (parts.length >= 3) {
          const cat = parts[0].toLowerCase();
          if (cat === targetCategory) {
            foundCategoryMatch = true;
            QuotaManager.applyAgyUsageLine(parts);
          }
        }
      }

      if (!foundCategoryMatch) {
        for (const line of lines) {
          const parts = line.split("\t").map((s) => s.trim());
          if (parts.length >= 3) {
            QuotaManager.applyAgyUsageLine(parts);
          }
        }
      }

      QuotaManager.agyState.category = isClaudeOrGpt
        ? "Claude/GPT"
        : "Gemini";
      QuotaManager.agyState.lastUpdated = Date.now();
      QuotaManager.persist();
      QuotaManager.notify();
    } catch (e: any) {
      debugLog("updateFromAgyUsageText error: " + e.message);
    }
  }

  private static applyAgyUsageLine(parts: string[]): void {
    const limitType = parts[1].toLowerCase();
    const pctMatch = parts[2].match(/(\d+)%/);
    if (!pctMatch) return;
    const remainingPct = parseInt(pctMatch[1], 10);
    // Limit Remaining XX% means used percentage is 100 - remaining
    const usedPct = Math.max(0, Math.min(100, 100 - remainingPct));
    const resetTimeStr = parts[3]
      ? QuotaManager.formatIsoTimestamp(parts[3])
      : undefined;

    if (
      limitType.includes("five hour") ||
      limitType.includes("5h") ||
      limitType.includes("session")
    ) {
      QuotaManager.agyState.fiveHourPercent = usedPct;
      if (resetTimeStr) {
        QuotaManager.agyState.fiveHourResetsAt = resetTimeStr;
      }
    } else if (
      limitType.includes("week") ||
      limitType.includes("7d") ||
      limitType.includes("seven day")
    ) {
      QuotaManager.agyState.weekPercent = usedPct;
      if (resetTimeStr) {
        QuotaManager.agyState.weekResetsAt = resetTimeStr;
      }
    }
  }

  public static async refreshQuota(engine?: "agy" | "claude"): Promise<QuotaState> {
    const active = engine || QuotaManager.getActiveEngine();
    try {
      if (active === "claude") {
        const usageText = await ClaudeClient.fetchLiveUsage();
        if (usageText) {
          QuotaManager.updateFromClaudeUsageText(usageText);
        }
      } else {
        const usageText = await AGYClient.fetchLiveUsage();
        if (usageText) {
          QuotaManager.updateFromAgyUsageText(usageText);
        }
      }
    } catch (e: any) {
      debugLog("refreshQuota error: " + e.message);
    }
    return QuotaManager.getState(active);
  }

  public static formatIsoTimestamp(isoString: string): string {
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      const m = date.getMonth() + 1;
      const d = date.getDate();
      const h = date.getHours().toString().padStart(2, "0");
      const min = date.getMinutes().toString().padStart(2, "0");
      return `${m}月${d}日 ${h}:${min}`;
    } catch (_) {
      return isoString;
    }
  }

  private static formatResetTimestamp(timestampSec: number): string {
    try {
      const date = new Date(timestampSec * 1000);
      const m = date.getMonth() + 1;
      const d = date.getDate();
      const h = date.getHours().toString().padStart(2, "0");
      const min = date.getMinutes().toString().padStart(2, "0");
      return `${m}月${d}日 ${h}:${min}`;
    } catch (_) {
      return "即将重置";
    }
  }
}
