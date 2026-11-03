import { ChatView, AGYPanelInstance } from "../chat/ChatView";
import { QuotaManager } from "../api/QuotaManager";

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
      "dependent=no",
      keepOnTop ? "alwaysRaised=yes" : "alwaysRaised=no",
    ]
      .filter(Boolean)
      .join(",");

    const dialogData = {
      loadLock: (Zotero.Promise as any).defer(),
    };

    // Open standalone XUL window as independent top-level window (no parent to avoid Win32 owned-window lock)
    const mainWindow = Zotero.getMainWindow() as any;
    const Ci = (Components as any)?.interfaces;
    const ww =
      mainWindow?.Services?.ww ||
      (typeof Services !== "undefined" ? (Services as any)?.ww : null) ||
      (Components as any)?.classes?.["@mozilla.org/embedcomp/window-watcher;1"]?.getService?.(
        Ci?.nsIWindowWatcher,
      );

    let win: Window;
    if (ww?.openWindow) {
      win = ww.openWindow(
        null,
        `chrome://${addon.data.config.addonRef}/content/standalone.xhtml`,
        `${addon.data.config.addonRef}-standalone`,
        features,
        dialogData,
      );
    } else {
      win = mainWindow.openDialog(
        `chrome://${addon.data.config.addonRef}/content/standalone.xhtml`,
        `${addon.data.config.addonRef}-standalone`,
        features,
        dialogData,
      );
    }

    this.win = win;

    await dialogData.loadLock.promise;

    // Apply always-on-top flags to window
    StandaloneWindow.setWindowAlwaysOnTop(win, keepOnTop);

    // Platform native pin adjustments
    const title = win.document?.title || "AGY 智能助手";
    if ((Zotero as any).isLinux) {
      StandaloneWindow.applyLinuxNativeAlwaysOnTop(title, keepOnTop);
      win.setTimeout(() => {
        StandaloneWindow.applyLinuxNativeAlwaysOnTop(title, keepOnTop);
      }, 250);
      win.setTimeout(() => {
        StandaloneWindow.applyLinuxNativeAlwaysOnTop(title, keepOnTop);
      }, 700);
    } else if (Zotero.isWin) {
      StandaloneWindow.applyWindowsNativeAlwaysOnTop(title, keepOnTop);
      win.setTimeout(() => {
        StandaloneWindow.applyWindowsNativeAlwaysOnTop(title, keepOnTop);
      }, 300);
    }

    // When main window is activated, ensure native keep-above hints remain intact
    if (mainWindow) {
      const onMainActivate = () => {
        if (StandaloneWindow.isOpen() && StandaloneWindow.isKeepOnTop()) {
          const t = win.document?.title || "AGY 智能助手";
          if ((Zotero as any).isLinux) {
            StandaloneWindow.applyLinuxNativeAlwaysOnTop(t, true);
          } else if (Zotero.isWin) {
            StandaloneWindow.applyWindowsNativeAlwaysOnTop(t, true);
          }
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
      ChatView.updateQuotaForPanel(
        this.panelInstance,
        QuotaManager.getState(),
      );
      ChatView.refreshLiveQuota();

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

  public static async applyWindowsNativeAlwaysOnTop(
    title: string,
    onTop: boolean,
  ): Promise<void> {
    if (!Zotero.isWin) return;
    try {
      const Subprocess = StandaloneWindow.getSubprocess();
      if (!Subprocess) return;

      const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinPin {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
    private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
    [DllImport("user32.dll", EntryPoint = "SetWindowLong")]
    private static extern int SetWindowLong32(IntPtr hWnd, int nIndex, int dwNewLong);
    public static IntPtr SetOwner(IntPtr hWnd, IntPtr hOwner) {
        if (IntPtr.Size == 8) return SetWindowLongPtr64(hWnd, -8, hOwner);
        return new IntPtr(SetWindowLong32(hWnd, -8, hOwner.ToInt32()));
    }
}
"@
[WinPin]::EnumWindows({
    param($hwnd, $lparam)
    if ([WinPin]::IsWindowVisible($hwnd)) {
        $sb = New-Object System.Text.StringBuilder 512
        [WinPin]::GetWindowTextW($hwnd, $sb, 512) | Out-Null
        $t = $sb.ToString()
        if ($t.Contains("AGY") -and $t.Contains("智能助手")) {
            if (${onTop ? '$true' : '$false'}) {
                [WinPin]::SetWindowPos($hwnd, [IntPtr](-1), 0, 0, 0, 0, 19)
            } else {
                [WinPin]::SetOwner($hwnd, [IntPtr]::Zero) | Out-Null
                [WinPin]::SetWindowPos($hwnd, [IntPtr](-2), 0, 0, 0, 0, 19)
            }
        }
    }
    return $true
}, [IntPtr]::Zero)
`;
      const proc = await Subprocess.call({
        command: "powershell.exe",
        arguments: [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          psScript,
        ],
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

    // 2. Query nsIAppWindow / nsIXULWindow interface and apply zLevel & flags
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
          const targetZ = onTop
            ? (Ci?.nsIXULWindow?.highestZ ?? 4)
            : (Ci?.nsIXULWindow?.normalZ ?? 2);
          appWin.zLevel = targetZ;

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

    // 3. Platform specific native adjustments
    if ((Zotero as any).isLinux) {
      const title = win.document?.title || "AGY 智能助手";
      StandaloneWindow.applyLinuxNativeAlwaysOnTop(title, onTop);
    } else if (Zotero.isWin) {
      const title = win.document?.title || "AGY 智能助手";
      StandaloneWindow.applyWindowsNativeAlwaysOnTop(title, onTop);
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
