import { AGYClient } from "../api/AGYClient";

export class OAuthManager {
  /** Check if Antigravity CLI is ready */
  static async checkStatus(): Promise<{
    available: boolean;
    path: string | null;
    error?: string;
  }> {
    return await AGYClient.checkCLIStatus();
  }

  static isLoggedIn(): boolean {
    // With Antigravity CLI, the local CLI binary is already authenticated
    return true;
  }

  static getUserInfo(): { name: string; email: string; avatar: string } {
    return {
      name: "Antigravity CLI",
      email: "本地已就绪",
      avatar: "",
    };
  }

  static async getAccessToken(): Promise<string | null> {
    const status = await AGYClient.checkCLIStatus();
    return status.available ? "agy-cli" : null;
  }

  static async login(): Promise<void> {
    const status = await AGYClient.checkCLIStatus();
    const binName = AGYClient.getBinName();
    if (status.available) {
      new ztoolkit.ProgressWindow(addon.data.config.addonName)
        .createLine({
          text: `✅ Antigravity CLI (${binName}) 已就绪: ${status.path}`,
          type: "default",
          progress: 100,
        })
        .show(3000);
    } else {
      new ztoolkit.ProgressWindow(addon.data.config.addonName)
        .createLine({
          text: `⚠️ 未检测到 ${binName}: ${status.error || ""}`,
          type: "error",
          progress: 100,
        })
        .show(-1);
    }
  }

  static logout(): void {
    // Reset custom CLI path
    Zotero.Prefs.set(`${addon.data.config.prefsPrefix}.cliPath`, "", true);
  }
}
