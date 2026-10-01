import { ChatView, AGYPanelInstance } from "../chat/ChatView";

export class StandaloneWindow {
  private static win: Window | null = null;
  private static panelInstance: AGYPanelInstance | null = null;

  public static isOpen(): boolean {
    return !!(this.win && !this.win.closed);
  }

  public static async open(): Promise<Window> {
    if (this.isOpen()) {
      this.win!.focus();
      return this.win!;
    }

    const keepOnTop =
      Zotero.Prefs.get(
        `${addon.data.config.prefsPrefix}.keepWindowTop`,
        true,
      ) !== false;
    const features = [
      "chrome",
      "extrachrome",
      "menubar=no",
      "resizable=yes",
      "scrollbars=no",
      "status=no",
      "dialog=no",
      keepOnTop ? "alwaysRaised=yes" : "",
    ]
      .filter(Boolean)
      .join(",");

    const dialogData = {
      loadLock: (Zotero.Promise as any).defer(),
    };

    // Open standalone XUL window
    const win = (Zotero.getMainWindow() as any).openDialog(
      `chrome://${addon.data.config.addonRef}/content/standalone.xhtml`,
      `${addon.data.config.addonRef}-standalone`,
      features,
      dialogData,
    );

    this.win = win;

    await dialogData.loadLock.promise;

    const root = win.document.getElementById(
      "zoteroagy-standalone-root",
    ) as HTMLElement;
    if (root) {
      // Build AGY panel in standalone window
      this.panelInstance = ChatView.createPanel(win.document, true);
      root.appendChild(this.panelInstance.panel);
      ChatView.renderHistoryForPanel(this.panelInstance);
      ChatView.renderContextsForPanel(this.panelInstance);
      ChatView.updateAuthStatusForPanel(this.panelInstance);
    }

    win.addEventListener("unload", () => {
      if (this.panelInstance) {
        ChatView.removePanel(this.panelInstance);
        this.panelInstance = null;
      }
      this.win = null;
    });

    win.focus();
    return win;
  }

  public static async togglePin(): Promise<void> {
    const current =
      Zotero.Prefs.get(
        `${addon.data.config.prefsPrefix}.keepWindowTop`,
        true,
      ) !== false;
    const next = !current;
    Zotero.Prefs.set(
      `${addon.data.config.prefsPrefix}.keepWindowTop`,
      next,
      true,
    );

    if (this.isOpen() && this.win) {
      let applied = false;
      try {
        const ifaces = (Components as any)?.interfaces;
        const treeOwner = (this.win as any)?.docShell?.treeOwner;
        const xulWin = treeOwner
          ?.QueryInterface?.(ifaces?.nsIInterfaceRequestor)
          ?.getInterface?.(ifaces?.nsIXULWindow);
        if (xulWin && ifaces?.nsIXULWindow) {
          xulWin.zLevel = next
            ? ifaces.nsIXULWindow.raisedZ
            : ifaces.nsIXULWindow.normalZ;
          applied = true;
        }
      } catch (e) {}

      // Update button visual
      if (this.panelInstance?.pinButton) {
        this.panelInstance.pinButton.textContent = next
          ? "📌 已置顶"
          : "📍 未置顶";
        this.panelInstance.pinButton.style.color = next ? "#188038" : "#666";
        this.panelInstance.pinButton.style.borderColor = next
          ? "#188038"
          : "rgba(0,0,0,0.18)";
        this.panelInstance.pinButton.title = next
          ? "当前状态：已置顶在屏幕最前端（点击取消置顶）"
          : "当前状态：未置顶（点击开启屏幕置顶）";
      }

      new ztoolkit.ProgressWindow(addon.data.config.addonName)
        .createLine({
          text: next ? "📌 已开启独立窗口置顶" : "📍 已取消置顶",
          type: "default",
          progress: 100,
        })
        .show(2000);

      if (!applied) {
        // Reopen window to apply alwaysRaised flag
        this.win.close();
        setTimeout(() => this.open(), 100);
      }
    }
  }

  public static refreshContexts(): void {
    if (this.panelInstance) {
      ChatView.renderContextsForPanel(this.panelInstance);
    }
  }

  public static refreshHistory(): void {
    if (this.panelInstance) {
      ChatView.renderHistoryForPanel(this.panelInstance);
    }
  }

  public static focus(): void {
    if (this.isOpen()) {
      this.win!.focus();
    }
  }
}
