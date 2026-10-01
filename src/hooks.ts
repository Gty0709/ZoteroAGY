import { getString, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { createZToolkit } from "./utils/ztoolkit";
// Using placeholder for now, actual implementation will connect modules later
import { PDFSelection } from "./modules/context/PDFSelection";
import { AnnotationCard } from "./modules/context/AnnotationCard";
import { ChatUI } from "./modules/chat/ChatUI";
import { ChatManager } from "./modules/chat/ChatManager";
import { OAuthManager } from "./modules/auth/OAuthManager";
import { ChatView } from "./modules/chat/ChatView";
import { StandaloneWindow } from "./modules/window/StandaloneWindow";

async function onStartup() {
  debugLog("onStartup called!");
  // Immediately register reader events before awaiting promises so restored readers get hooks
  try {
    PDFSelection.registerReaderEvents();
  } catch (e: any) {
    debugLog(
      "registerReaderEvents failed in onStartup: " +
        (e?.stack || e?.message || e),
    );
  }

  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);
  debugLog("Zotero promises resolved in onStartup");
  initLocale();
  ChatManager.loadConversations();
  // Register preferences pane
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
  // Register notifier
  const callback = {
    notify: async (
      event: string,
      type: string,
      ids: number[] | string[],
      extraData: { [key: string]: any },
    ) => {
      if (!addon?.data.alive) return;
      addon.hooks.onNotify(event, type, ids, extraData);
      if (type === "tab") {
        try {
          PDFSelection.refreshOpenReaders();
        } catch (_) {}
      }
    },
  };
  Zotero.Notifier.registerObserver(callback, ["tab", "item", "file"]);
  // Register sidebar section
  registerSidebarSection();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  try {
    PDFSelection.refreshOpenReaders();
  } catch (e: any) {
    debugLog("refreshOpenReaders failed in onStartup: " + e);
  }

  addon.data.initialized = true;
  debugLog("onStartup completed!");
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  debugLog(
    "onMainWindowLoad called! win=" + (win ? win.document?.title : "null"),
  );
  addon.data.ztoolkit = createZToolkit();
  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  // Listen for sidebar message events
  win.addEventListener("message", (event) => {
    ChatUI.handleMessage(event);
  });

  const popupWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({
      text: getString("startup-begin"),
      type: "default",
      progress: 0,
    })
    .show();

  // Register sidebar section
  registerSidebarSection();
  // Register menus
  registerMenus();
  // Register reader events (sidebar annotation header button, selection popup, toolbar)
  try {
    PDFSelection.registerReaderEvents();
    PDFSelection.refreshOpenReaders();
  } catch (e) {
    ztoolkit.log("Failed to register PDF reader events", e);
  }

  // Register stylesheet
  const doc = win.document;
  const styles = ztoolkit.UI.createElement(doc, "link", {
    properties: {
      type: "text/css",
      rel: "stylesheet",
      href: `chrome://${addon.data.config.addonRef}/content/zoteroPane.css`,
    },
  });
  doc.documentElement?.appendChild(styles);

  // Load mermaid into mainWindow
  try {
    const url =
      typeof rootURI !== "undefined"
        ? rootURI + "content/mermaid.min.js"
        : `chrome://${addon.data.config.addonRef}/content/mermaid.min.js`;
    // @ts-ignore
    Services.scriptloader.loadSubScript(url, win);
    debugLog("Loaded mermaid.min.js into mainWindow");
  } catch (e: any) {
    debugLog(
      "Failed to load mermaid.min.js into mainWindow: " + (e?.message || e),
    );
  }

  popupWin.changeLine({
    progress: 100,
    text: `[100%] ${getString("startup-finish")}`,
  });
  popupWin.startCloseTimer(3000);
}

export function debugLog(msg: string) {
  try {
    const text = `[HOOK ${new Date().toISOString()}] ${msg}\r\n`;
    try {
      // @ts-ignore
      if (typeof Zotero !== "undefined" && Zotero.debug)
        Zotero.debug("[ZoteroAGY] " + msg);
    } catch (_) {}
    try {
      // @ts-ignore
      const file = Components.classes[
        "@mozilla.org/file/local;1"
      ].createInstance(Components.interfaces.nsIFile);
      file.initWithPath("C:\\Users\\Administrator\\agy_debug.log");
      // @ts-ignore
      const foStream = Components.classes[
        "@mozilla.org/network/file-output-stream;1"
      ].createInstance(Components.interfaces.nsIFileOutputStream);
      foStream.init(file, 0x02 | 0x08 | 0x10, 0o666, 0); // 0x10 is PR_APPEND
      // @ts-ignore
      const converter = Components.classes[
        "@mozilla.org/intl/converter-output-stream;1"
      ].createInstance(Components.interfaces.nsIConverterOutputStream);
      converter.init(foStream, "UTF-8", 0, 0);
      converter.writeString(text);
      converter.close();
    } catch (e: any) {}
  } catch (e: any) {}
}

let isSectionRegistered = false;

function registerSidebarSection() {
  debugLog(
    "registerSidebarSection invoked. isSectionRegistered=" +
      isSectionRegistered,
  );
  if (isSectionRegistered) return;
  isSectionRegistered = true;

  Zotero.ItemPaneManager.registerSection({
    paneID: "agy-chat",
    pluginID: addon.data.config.addonID,
    header: {
      l10nID: `${addon.data.config.addonRef}-item-section-agy-head-text`,
      icon: `chrome://${addon.data.config.addonRef}/content/icons/agy-icon-16.svg`,
    },
    sidenav: {
      l10nID: `${addon.data.config.addonRef}-item-section-agy-sidenav-tooltip`,
      icon: `chrome://${addon.data.config.addonRef}/content/icons/agy-icon.svg`,
    },
    bodyXHTML:
      '<html:div id="agy-placeholder" style="display:flex; flex-direction:column; min-height:520px; padding:16px; color:#222; font-family:sans-serif; background:#ffffff; border:1px solid #ddd; border-radius:6px; margin:4px;">⏳ AGY 智能助手正在加载...</html:div>',
    onInit: ({ body, setEnabled, item, tabType }) => {
      debugLog(
        "HOOK onInit called! body=" +
          (body ? body.tagName : "null") +
          ", tabType=" +
          tabType,
      );
      try {
        setEnabled(true);
        const section = body.closest("collapsible-section") as any;
        if (section) {
          section.removeAttribute("empty");
          section.empty = false;
          section.style.setProperty("--open-height", "auto", "important");
          section.setAttribute("open", "true");
          section.open = true;
          section.removeAttribute("no-collapse");
        }
        ChatView.init(body, item);
      } catch (e: any) {
        debugLog("Error in onInit: " + (e?.stack || e?.message || e));
        ztoolkit.log("Error in onInit:", e);
      }
    },
    onItemChange: ({ body, setEnabled, item, tabType }) => {
      debugLog(
        "HOOK onItemChange called! item=" +
          (item ? item.id : "null") +
          ", tabType=" +
          tabType,
      );
      try {
        setEnabled(true);
        const section = body.closest("collapsible-section") as any;
        if (section) {
          section.removeAttribute("empty");
          section.empty = false;
          section.style.setProperty("--open-height", "auto", "important");
          section.setAttribute("open", "true");
          section.open = true;
          section.removeAttribute("no-collapse");
        }
        ChatView.init(body, item);
        if (tabType === "reader") {
          try {
            PDFSelection.refreshOpenReaders();
          } catch (_) {}
        }
        return true;
      } catch (e: any) {
        debugLog("Error in onItemChange: " + (e?.stack || e?.message || e));
        ztoolkit.log("Error in onItemChange:", e);
        return true;
      }
    },
    onRender: ({ body, item, tabType }) => {
      debugLog(
        "HOOK onRender called! body=" +
          (body ? body.tagName : "null") +
          ", item=" +
          (item ? item.id : "null"),
      );
      try {
        const section = body.closest("collapsible-section") as any;
        if (section) {
          section.removeAttribute("empty");
          section.empty = false;
          section.style.setProperty("--open-height", "auto", "important");
          section.setAttribute("open", "true");
          section.open = true;
          section.removeAttribute("no-collapse");
        }
        ChatView.init(body, item);
      } catch (e: any) {
        debugLog("Error in onRender: " + (e?.stack || e?.message || e));
        ztoolkit.log("Error in onRender:", e);
      }
    },
    onAsyncRender: async ({ body, item, tabType, setEnabled }) => {
      debugLog(
        "HOOK onAsyncRender called! body=" +
          (body ? body.tagName : "null") +
          ", item=" +
          (item ? item.id : "null"),
      );
      try {
        setEnabled?.(true);
        const section = body.closest("collapsible-section") as any;
        if (section) {
          section.removeAttribute("empty");
          section.empty = false;
          section.style.setProperty("--open-height", "auto", "important");
          section.setAttribute("open", "true");
          section.open = true;
          section.removeAttribute("no-collapse");
        }
        ChatView.init(body, item);
      } catch (e: any) {
        debugLog("Error in onAsyncRender: " + (e?.stack || e?.message || e));
        ztoolkit.log("Error in onAsyncRender:", e);
      }
    },
    onToggle: ({ event, body, item }: any) => {
      debugLog("HOOK onToggle called!");
      try {
        const section = body?.closest?.("collapsible-section") as any;
        if (section && section.open) {
          ChatView.init(body, item);
        }
      } catch (e: any) {
        debugLog("Error in onToggle: " + (e?.stack || e?.message || e));
      }
    },
  });
}

function registerMenus() {
  try {
    AnnotationCard.registerAnnotationMenu();
  } catch (e) {
    ztoolkit.log("Failed to register annotation menu", e);
  }

  try {
    ztoolkit.Menu.register("menuTools", {
      tag: "menuitem",
      label: "AGY 智能助手 (独立浮动窗口)",
      icon: `chrome://${addon.data.config.addonRef}/content/icons/agy-icon-16.svg`,
      commandListener: () => {
        StandaloneWindow.open();
      },
    });
  } catch (e) {
    ztoolkit.log("Failed to register tools menu item", e);
  }
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}
function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error
  delete Zotero[addon.data.config.addonInstance];
}
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  ztoolkit.log("notify", event, type, ids, extraData);
}
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  if (type === "load") registerPrefsScripts(data.window);
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
};
