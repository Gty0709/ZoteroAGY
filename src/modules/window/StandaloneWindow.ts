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
      keepOnTop ? "dependent=yes" : "dialog=no",
      keepOnTop ? "alwaysRaised=yes,alwaysRaised" : "",
    ]
      .filter(Boolean)
      .join(",");

    const dialogData = {
      loadLock: (Zotero.Promise as any).defer(),
    };

    // Open standalone XUL window
    const mainWindow = Zotero.getMainWindow() as any;
    const win = mainWindow.openDialog(
      `chrome://${addon.data.config.addonRef}/content/standalone.xhtml`,
      `${addon.data.config.addonRef}-standalone`,
      features,
      dialogData,
    );

    this.win = win;

    await dialogData.loadLock.promise;

    // Apply always-on-top flags to window
    StandaloneWindow.setWindowAlwaysOnTop(win, keepOnTop);

    // On Linux, schedule native X11 window hints retries after window is fully mapped
    if ((Zotero as any).isLinux) {
      const title = win.document?.title || "AGY 智能助手";
      StandaloneWindow.applyLinuxNativeAlwaysOnTop(title, keepOnTop);
      win.setTimeout(() => {
        StandaloneWindow.applyLinuxNativeAlwaysOnTop(title, keepOnTop);
      }, 250);
      win.setTimeout(() => {
        StandaloneWindow.applyLinuxNativeAlwaysOnTop(title, keepOnTop);
      }, 700);
    }

    // When main window is activated, ensure native keep-above hints remain intact
    if (mainWindow) {
      const onMainActivate = () => {
        if (
          StandaloneWindow.isOpen() &&
          StandaloneWindow.isKeepOnTop() &&
          (Zotero as any).isLinux
        ) {
          const title = win.document?.title || "AGY 智能助手";
          StandaloneWindow.applyLinuxNativeAlwaysOnTop(title, true);
        }
      };
      mainWindow.addEventListener("activate", onMainActivate);
      win.addEventListener("unload", () => {
        mainWindow.removeEventListener("activate", onMainActivate);
      });
    }

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

  public static isKeepOnTop(): boolean {
    return (
      Zotero.Prefs.get(
        `${addon.data.config.prefsPrefix}.keepWindowTop`,
        true,
      ) !== false
    );
  }

  private static getSubprocess(): any {
    try {
      // @ts-ignore
      return ChromeUtils.importESModule(
        "resource://gre/modules/Subprocess.sys.mjs",
      ).Subprocess;
    } catch (_) {
      try {
        const scope: any = {};
        // @ts-ignore
        Components.utils.import("resource://gre/modules/Subprocess.jsm", scope);
        return scope.Subprocess;
      } catch (_) {
        return null;
      }
    }
  }

  public static async applyLinuxNativeAlwaysOnTop(
    title: string,
    onTop: boolean,
  ): Promise<void> {
    if (!(Zotero as any).isLinux) return;
    try {
      const Subprocess = StandaloneWindow.getSubprocess();
      if (!Subprocess) return;

      const script = onTop
        ? `
AGY_ID=$(xwininfo -root -tree 2>/dev/null | grep -F "${title}" | head -n 1 | awk '{print $1}')
if [ -n "$AGY_ID" ]; then
  MAIN_ID=$(xwininfo -root -tree 2>/dev/null | grep -F " - Zotero" | head -n 1 | awk '{print $1}')
  xprop -id "$AGY_ID" -f _NET_WM_STATE 32a -set _NET_WM_STATE _NET_WM_STATE_ABOVE 2>/dev/null
  if [ -n "$MAIN_ID" ]; then
    xprop -id "$AGY_ID" -f WM_TRANSIENT_FOR 32x -set WM_TRANSIENT_FOR "$MAIN_ID" 2>/dev/null
  fi
fi
`
        : `
AGY_ID=$(xwininfo -root -tree 2>/dev/null | grep -F "${title}" | head -n 1 | awk '{print $1}')
if [ -n "$AGY_ID" ]; then
  xprop -id "$AGY_ID" -remove _NET_WM_STATE 2>/dev/null
  xprop -id "$AGY_ID" -remove WM_TRANSIENT_FOR 2>/dev/null
fi
`;

      const proc = await Subprocess.call({
        command: "/bin/sh",
        arguments: ["-c", script],
        stdout: "ignore",
        stderr: "ignore",
      });
      await proc.wait();
    } catch (_) {}
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
          const CHROME_DEPENDENT =
            Ci?.nsIWebBrowserChrome?.CHROME_DEPENDENT ?? 8388608;
          if (onTop) {
            appWin.chromeFlags |= CHROME_ALWAYS_ON_TOP;
            appWin.chromeFlags |= CHROME_DEPENDENT;
          } else {
            appWin.chromeFlags &= ~CHROME_ALWAYS_ON_TOP;
            appWin.chromeFlags &= ~CHROME_DEPENDENT;
          }
        } catch (_) {}
        applied = true;
      }
    } catch (_) {}

    // 3. Platform specific adjustments
    if ((Zotero as any).isLinux) {
      const title = win.document?.title || "AGY 智能助手";
      StandaloneWindow.applyLinuxNativeAlwaysOnTop(title, onTop);
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
