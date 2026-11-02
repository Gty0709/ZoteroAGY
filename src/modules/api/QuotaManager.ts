import { ClaudeClient } from "./ClaudeClient";
import { debugLog } from "../../hooks";

export interface QuotaState {
  weekPercent: number;
  weekResetsAt?: string;
  fiveHourPercent: number;
  fiveHourResetsAt?: string;
  lastUpdated: number;
  activeBackend: "agy" | "claude";
}

export class QuotaManager {
  private static getPrefKey(): string {
    const prefix =
      typeof addon !== "undefined" && addon?.data?.config?.prefsPrefix
        ? addon.data.config.prefsPrefix
        : "extensions.zoteroagy";
    return `${prefix}.quotaState`;
  }

  private static listeners: Set<(state: QuotaState) => void> = new Set();

  private static currentState: QuotaState = {
    weekPercent: 41,
    weekResetsAt: "周重置",
    fiveHourPercent: 2,
    fiveHourResetsAt: "5h重置",
    lastUpdated: Date.now(),
    activeBackend: "agy",
  };

  private static isInitialized = false;

  public static init(): void {
    if (QuotaManager.isInitialized) return;
    QuotaManager.isInitialized = true;
    try {
      const saved = Zotero.Prefs.get(QuotaManager.getPrefKey(), true) as string;
      if (saved) {
        const parsed = JSON.parse(saved);
        QuotaManager.currentState = { ...QuotaManager.currentState, ...parsed };
      }
    } catch (_) {}
  }

  public static getState(): QuotaState {
    QuotaManager.init();
    return { ...QuotaManager.currentState };
  }

  public static addListener(fn: (state: QuotaState) => void): () => void {
    QuotaManager.listeners.add(fn);
    return () => QuotaManager.listeners.delete(fn);
  }

  private static notify(): void {
    for (const fn of QuotaManager.listeners) {
      try {
        fn(QuotaManager.currentState);
      } catch (e) {
        debugLog("QuotaManager notify error: " + e);
      }
    }
  }

  private static persist(): void {
    try {
      Zotero.Prefs.set(
        QuotaManager.getPrefKey(),
        JSON.stringify(QuotaManager.currentState),
        true,
      );
    } catch (_) {}
  }

  /**
   * Update quota metrics from real-time stream event:
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
        QuotaManager.currentState.fiveHourPercent = Math.round(
          fiveHour.utilization * 100,
        );
        if (fiveHour.resetsAt) {
          QuotaManager.currentState.fiveHourResetsAt =
            QuotaManager.formatResetTimestamp(fiveHour.resetsAt);
        }
        changed = true;
      }

      if (sevenDay && typeof sevenDay.utilization === "number") {
        QuotaManager.currentState.weekPercent = Math.round(
          sevenDay.utilization * 100,
        );
        if (sevenDay.resetsAt) {
          QuotaManager.currentState.weekResetsAt =
            QuotaManager.formatResetTimestamp(sevenDay.resetsAt);
        }
        changed = true;
      }

      if (changed) {
        QuotaManager.currentState.lastUpdated = Date.now();
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
  public static updateFromUsageText(text: string): void {
    if (!text) return;
    try {
      const sessionMatch = text.match(
        /Current session:\s*(\d+)%\s*used(?:\s*·\s*resets\s*([^)\n\r]+))?/i,
      );
      if (sessionMatch) {
        QuotaManager.currentState.fiveHourPercent = parseInt(
          sessionMatch[1],
          10,
        );
        if (sessionMatch[2]) {
          QuotaManager.currentState.fiveHourResetsAt = sessionMatch[2].trim();
        }
      }

      const weekMatch = text.match(
        /Current week[^:]*:\s*(\d+)%\s*used(?:\s*·\s*resets\s*([^)\n\r]+))?/i,
      );
      if (weekMatch) {
        QuotaManager.currentState.weekPercent = parseInt(weekMatch[1], 10);
        if (weekMatch[2]) {
          QuotaManager.currentState.weekResetsAt = weekMatch[2].trim();
        }
      }

      QuotaManager.currentState.lastUpdated = Date.now();
      QuotaManager.persist();
      QuotaManager.notify();
    } catch (e: any) {
      debugLog("updateFromUsageText error: " + e.message);
    }
  }

  public static async refreshQuota(): Promise<QuotaState> {
    try {
      const usageText = await ClaudeClient.fetchLiveUsage();
      if (usageText) {
        QuotaManager.updateFromUsageText(usageText);
      }
    } catch (e: any) {
      debugLog("refreshQuota error: " + e.message);
    }
    return QuotaManager.getState();
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
