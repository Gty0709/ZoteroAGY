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
      keepOnTop ? "alwaysRaised=yes,alwaysRaised" : "",
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

    // Apply always-on-top flags to window
    StandaloneWindow.setWindowAlwaysOnTop(win, keepOnTop);

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

      if (this.panelInstance.pinButton) {
        this.panelInstance.pinButton.textContent = keepOnTop
          ? "📌 已置顶"
          : "📍 未置顶";
        this.panelInstance.pinButton.style.color = keepOnTop
          ? "#188038"
          : "#666";
        this.panelInstance.pinButton.style.borderColor = keepOnTop
          ? "#188038"
          : "rgba(0,0,0,0.18)";
        this.panelInstance.pinButton.title = keepOnTop
          ? "当前状态：已置顶在屏幕最前端（点击取消置顶）"
          : "当前状态：未置顶（点击开启屏幕置顶）";
      }
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

  public static setWindowAlwaysOnTop(win: Window, onTop: boolean): boolean {
    if (!win) return false;
    let applied = false;

    // 1. Set level and alwaysraised attributes on root XUL element
    try {
      const docEl = win.document?.documentElement;
      if (docEl) {
        docEl.setAttribute("level", onTop ? "top" : "normal");
        docEl.setAttribute("alwaysraised", onTop ? "true" : "false");
        applied = true;
      }
    } catch (_) {}

    // 2. Query nsIAppWindow / nsIXULWindow interface
    try {
      const Ci = (Components as any)?.interfaces;
      let appWin: any = null;

      try {
        const treeOwner = (win as any)?.docShell?.treeOwner;
        appWin = treeOwner
          ?.QueryInterface?.(Ci?.nsIInterfaceRequestor)
          ?.getInterface?.(Ci?.nsIAppWindow || Ci?.nsIXULWindow);
      } catch (_) {}

      if (!appWin) {
        try {
          const wm = (Services as any)?.wm;
          appWin = wm?.getAppWindowFor?.(win) || wm?.getXULWindowFor?.(win);
        } catch (_) {}
      }

      if (appWin) {
        try {
          const CHROME_ALWAYS_ON_TOP =
            Ci?.nsIWebBrowserChrome?.CHROME_ALWAYS_ON_TOP ?? 524288;
          if (onTop) {
            appWin.chromeFlags |= CHROME_ALWAYS_ON_TOP;
          } else {
            appWin.chromeFlags &= ~CHROME_ALWAYS_ON_TOP;
          }
        } catch (_) {}

        try {
          const highestZ =
            Ci?.nsIAppWindow?.highestZ ?? Ci?.nsIXULWindow?.highestZ ?? 9;
          const normalZ =
            Ci?.nsIAppWindow?.normalZ ?? Ci?.nsIXULWindow?.normalZ ?? 5;
          appWin.zLevel = onTop ? highestZ : normalZ;
        } catch (_) {}
        applied = true;
      }
    } catch (_) {}

    // 3. Platform specific adjustments
    if (onTop && (Zotero as any).isLinux) {
      try {
        win.focus();
      } catch (_) {}
    }

    return applied;
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
      StandaloneWindow.setWindowAlwaysOnTop(this.win, next);

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
