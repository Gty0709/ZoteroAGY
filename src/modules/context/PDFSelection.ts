import { ContextManager } from "./ContextManager";
import { ChatView } from "../chat/ChatView";
import { StandaloneWindow } from "../window/StandaloneWindow";
import { debugLog } from "../../hooks";

export class PDFSelection {
  private static readerEventsRegistered = false;

  /** Register reader-related hooks: selection popup, sidebar annotation cards, toolbar, context menu */
  static registerReaderEvents(): void {
    if (this.readerEventsRegistered) return;
    this.readerEventsRegistered = true;

    debugLog("Registering PDF reader events...");

    // 1. Injected button on each annotation card in the left sidebar
    try {
      Zotero.Reader.registerEventListener(
        "renderSidebarAnnotationHeader",
        (event: any) => {
          try {
            debugLog(
              "renderSidebarAnnotationHeader fired for annotation: " +
                event?.params?.annotation?.id,
            );
            const { reader, doc, params, append } = event;
            const annotation = params?.annotation;
            if (!annotation) return;

            const btn = doc.createElementNS(
              "http://www.w3.org/1999/xhtml",
              "div",
            );
            btn.className = "icon agy-sidebar-annotation-btn";
            btn.title = "添加到 AGY 对话上下文";
            btn.style.cssText = [
              "display: inline-flex",
              "align-items: center",
              "justify-content: center",
              "width: 20px",
              "height: 20px",
              "cursor: pointer",
              "border-radius: 4px",
              "color: #2b7fff",
              "opacity: 0.9",
              "transition: all 0.15s ease",
              "vertical-align: middle",
              "margin-inline-end: 2px",
            ].join(";");

            // Spark SVG icon
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="display:block;">
              <path fill-rule="evenodd" d="M10 1.5C10 6.19 13.8 10 18.5 10C13.8 10 10 13.8 10 18.5C10 13.8 6.2 10 1.5 10C6.2 10 10 6.19 10 1.5Z"/>
            </svg>`;

            btn.addEventListener("mouseenter", () => {
              btn.style.opacity = "1";
              btn.style.backgroundColor =
                "var(--color-sidepane, rgba(43, 127, 255, 0.15))";
            });
            btn.addEventListener("mouseleave", () => {
              btn.style.opacity = "0.9";
              btn.style.backgroundColor = "transparent";
            });

            btn.addEventListener("click", (e: MouseEvent) => {
              e.stopPropagation();
              e.preventDefault();
              PDFSelection.addAnnotationToContext(reader, annotation, btn);
            });

            append(btn);
          } catch (err: any) {
            debugLog(
              "Error in renderSidebarAnnotationHeader handler: " +
                (err?.stack || err?.message || err),
            );
          }
        },
        addon.data.config.addonID,
      );
      debugLog("renderSidebarAnnotationHeader registered successfully");
    } catch (e: any) {
      debugLog("renderSidebarAnnotationHeader failed to register: " + e);
    }

    // 2. Text selection floating popup menu item in reader
    try {
      Zotero.Reader.registerEventListener(
        "renderTextSelectionPopup",
        (event: any) => {
          try {
            debugLog("renderTextSelectionPopup fired");
            const { reader, doc, params, append } = event;
            const div = doc.createElementNS(
              "http://www.w3.org/1999/xhtml",
              "div",
            );
            div.className = "section agy-selection-popup-btn";
            div.style.cssText = [
              "display: flex",
              "align-items: center",
              "gap: 6px",
              "padding: 6px 10px",
              "cursor: pointer",
              "color: #2b7fff",
              "font-size: 12px",
              "font-weight: 600",
              "user-select: none",
            ].join(";");
            div.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="flex-shrink:0;">
              <path fill-rule="evenodd" d="M10 1.5C10 6.19 13.8 10 18.5 10C13.8 10 10 13.8 10 18.5C10 13.8 6.2 10 1.5 10C6.2 10 10 6.19 10 1.5Z"/>
            </svg><span>添加到 AGY 对话</span>`;

            div.addEventListener("mouseenter", () => {
              div.style.backgroundColor = "rgba(43, 127, 255, 0.08)";
            });
            div.addEventListener("mouseleave", () => {
              div.style.backgroundColor = "transparent";
            });

            div.addEventListener("click", (e: MouseEvent) => {
              e.stopPropagation();
              e.preventDefault();
              PDFSelection.addSelectionToContext(reader, params);
            });

            append(div);
          } catch (err: any) {
            debugLog(
              "Error in renderTextSelectionPopup handler: " +
                (err?.stack || err?.message || err),
            );
          }
        },
        addon.data.config.addonID,
      );
      debugLog("renderTextSelectionPopup registered successfully");
    } catch (e: any) {
      debugLog("renderTextSelectionPopup failed to register: " + e);
    }

    // 3. Right-click context menu on annotations (both in PDF view and left sidebar)
    try {
      Zotero.Reader.registerEventListener(
        "createAnnotationContextMenu",
        (event: any) => {
          try {
            debugLog("createAnnotationContextMenu fired");
            const { reader, params, append } = event;
            const ids = params?.ids || [];
            if (!ids.length) return;

            append([
              {
                label: "添加到 AGY 对话上下文",
                icon: `chrome://${addon.data.config.addonRef}/content/icons/agy-icon-16.svg`,
                onCommand: () => {
                  PDFSelection.addAnnotationIdsToContext(reader, ids);
                },
              },
            ]);
          } catch (err: any) {
            debugLog(
              "Error in createAnnotationContextMenu handler: " +
                (err?.stack || err?.message || err),
            );
          }
        },
        addon.data.config.addonID,
      );
      debugLog("createAnnotationContextMenu registered successfully");
    } catch (e: any) {
      debugLog("createAnnotationContextMenu failed to register: " + e);
    }

    // 4. Reader top toolbar button to open standalone floating AGY window
    try {
      Zotero.Reader.registerEventListener(
        "renderToolbar",
        (event: any) => {
          try {
            debugLog("renderToolbar fired");
            const { reader, doc, params, append } = event;
            const btn = doc.createElementNS(
              "http://www.w3.org/1999/xhtml",
              "button",
            );
            btn.className = "toolbar-button agy-reader-toolbar-btn";
            btn.title = "打开 AGY 独立浮动助手窗口 (支持置顶)";
            btn.style.cssText = [
              "display: inline-flex",
              "align-items: center",
              "gap: 4px",
              "padding: 2px 8px",
              "cursor: pointer",
              "font-size: 12px",
              "border: 1px solid rgba(0,0,0,0.15)",
              "border-radius: 4px",
              "background: transparent",
              "margin-inline-start: 4px",
              "color: var(--material-text-primary, #333)",
            ].join(";");
            btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 20 20" fill="#2b7fff"><path fill-rule="evenodd" d="M10 1.5C10 6.19 13.8 10 18.5 10C13.8 10 10 13.8 10 18.5C10 13.8 6.2 10 1.5 10C6.2 10 10 6.19 10 1.5Z"/></svg><span>AGY 浮窗</span>`;
            btn.addEventListener("click", () => {
              StandaloneWindow.open();
            });
            append(btn);

            // Also attach DOM observer to reader to ensure left sidebar cards always have the button
            PDFSelection.observeReaderSidebar(reader);
          } catch (err: any) {
            debugLog(
              "Error in renderToolbar handler: " +
                (err?.stack || err?.message || err),
            );
          }
        },
        addon.data.config.addonID,
      );
      debugLog("renderToolbar registered successfully");
    } catch (e: any) {
      debugLog("renderToolbar failed to register: " + e);
    }

    // Also scan all existing open readers immediately
    this.refreshOpenReaders();
  }

  /** Refresh and observe all currently opened reader tabs */
  static refreshOpenReaders(): void {
    try {
      const readers = Zotero.Reader?._readers || [];
      debugLog("refreshOpenReaders called. Readers count: " + readers.length);
      for (const reader of readers) {
        PDFSelection.observeReaderSidebar(reader);
      }
    } catch (e: any) {
      debugLog("Error in refreshOpenReaders: " + e);
    }
  }

  /**
   * Directly observe and inject buttons into the reader's left sidebar DOM.
   * This guarantees cards receive the button even if React rendered them before event registration.
   */
  static async observeReaderSidebar(reader: any): Promise<void> {
    try {
      if (!reader) return;
      if (reader._initPromise) await reader._initPromise.catch(() => {});
      if (reader._lastView?.initializedPromise)
        await reader._lastView.initializedPromise.catch(() => {});

      const doc = reader._iframeWindow?.document;
      if (!doc) {
        setTimeout(() => PDFSelection.observeReaderSidebar(reader), 800);
        return;
      }

      debugLog("observeReaderSidebar attached to doc. Title: " + doc.title);

      const injectButtons = () => {
        try {
          const headers = doc.querySelectorAll(".preview header");
          headers.forEach((header: Element) => {
            if (header.querySelector(".agy-sidebar-annotation-btn")) return;

            // Find page element to extract annotation ID: id="page_XXXX"
            const pageEl = header.querySelector('[id^="page_"]');
            const annId = pageEl?.id?.replace("page_", "") || "";
            const annotation = reader._state?.annotations?.find(
              (a: any) => a.id === annId,
            );

            // Container: .custom-sections or .end
            const customSections = header.querySelector(".custom-sections");
            const targetContainer =
              customSections || header.querySelector(".end");
            if (!targetContainer) return;

            const btn = doc.createElementNS(
              "http://www.w3.org/1999/xhtml",
              "div",
            );
            btn.className = "icon agy-sidebar-annotation-btn";
            btn.title = "添加到 AGY 对话上下文";
            btn.style.cssText = [
              "display: inline-flex",
              "align-items: center",
              "justify-content: center",
              "width: 20px",
              "height: 20px",
              "cursor: pointer",
              "border-radius: 4px",
              "color: #2b7fff",
              "opacity: 0.9",
              "transition: all 0.15s ease",
              "vertical-align: middle",
              "margin-inline-end: 2px",
            ].join(";");
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="display:block;">
              <path fill-rule="evenodd" d="M10 1.5C10 6.19 13.8 10 18.5 10C13.8 10 10 13.8 10 18.5C10 13.8 6.2 10 1.5 10C6.2 10 10 6.19 10 1.5Z"/>
            </svg>`;

            btn.addEventListener("mouseenter", () => {
              btn.style.opacity = "1";
              btn.style.backgroundColor =
                "var(--color-sidepane, rgba(43, 127, 255, 0.15))";
            });
            btn.addEventListener("mouseleave", () => {
              btn.style.opacity = "0.9";
              btn.style.backgroundColor = "transparent";
            });
            btn.addEventListener("click", (e: MouseEvent) => {
              e.stopPropagation();
              e.preventDefault();
              const targetAnn = annotation || {
                id: annId,
                text:
                  header
                    .closest(".preview")
                    ?.querySelector(".text")
                    ?.textContent?.trim() || "",
                pageIndex:
                  parseInt(
                    pageEl?.querySelector(".label")?.textContent || "1",
                  ) - 1,
              };
              PDFSelection.addAnnotationToContext(reader, targetAnn, btn);
            });

            if (customSections) {
              const sec = doc.createElementNS(
                "http://www.w3.org/1999/xhtml",
                "div",
              );
              sec.className = "section";
              sec.appendChild(btn);
              customSections.appendChild(sec);
            } else {
              targetContainer.insertBefore(btn, targetContainer.firstChild);
            }
          });
        } catch (e: any) {
          debugLog("Error in injectButtons: " + e);
        }
      };

      // Initial injection
      injectButtons();

      // Repeat after short delays to catch late-mounted annotations
      setTimeout(injectButtons, 500);
      setTimeout(injectButtons, 1500);
      setTimeout(injectButtons, 3000);

      // Mutation observer to watch for new annotations or list updates
      if (!reader.__agySidebarObserver && doc.body) {
        const observer = new (
          reader._iframeWindow.MutationObserver || MutationObserver
        )((mutations: any) => {
          injectButtons();
        });
        observer.observe(doc.body, { childList: true, subtree: true });
        reader.__agySidebarObserver = observer;
      }
    } catch (e: any) {
      debugLog("Error in observeReaderSidebar: " + e);
    }
  }

  /** Add single annotation to context */
  static addAnnotationToContext(
    reader: any,
    annotation: any,
    btn?: HTMLElement,
  ): void {
    const text = (annotation.text || annotation.comment || "").trim();
    if (!text) {
      new ztoolkit.ProgressWindow(addon.data.config.addonName)
        .createLine({ text: "此注释无文本内容", type: "error", progress: 100 })
        .show(2000);
      return;
    }

    const page = (annotation.pageIndex ?? 0) + 1;
    const annKey = annotation.id || annotation.key || "";
    const libraryID =
      reader?._item?.libraryID || Zotero.Libraries?.userLibraryID;

    ContextManager.addContext({
      type: "annotation",
      text: text.slice(0, 1000),
      color: annotation.color,
      page,
      itemKey: annKey || reader._item?.key,
      annotationKey: annKey,
      libraryID,
      source: reader._item?.getField?.("title") || "PDF 批注",
    });

    // Refresh context UI across all active panels
    ChatView.renderContexts();
    StandaloneWindow.refreshContexts();

    // Flash checkmark
    if (btn) {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="#188038"><path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0z"/></svg>`;
      setTimeout(() => {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="display:block;"><path fill-rule="evenodd" d="M10 1.5C10 6.19 13.8 10 18.5 10C13.8 10 10 13.8 10 18.5C10 13.8 6.2 10 1.5 10C6.2 10 10 6.19 10 1.5Z"/></svg>`;
      }, 1500);
    }

    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({
        text: `已添加批注 [第 ${page} 页] 到 AGY 对话`,
        type: "success",
        progress: 100,
      })
      .show(2200);
  }

  /** Add multiple annotation IDs to context (from context menu) */
  static async addAnnotationIdsToContext(
    reader: any,
    ids: string[],
  ): Promise<void> {
    const annotations =
      reader._state?.annotations?.filter((x: any) => ids.includes(x.id)) || [];
    let addedCount = 0;
    for (const ann of annotations) {
      const text = (ann.text || ann.comment || "").trim();
      if (text) {
        const page = (ann.pageIndex ?? 0) + 1;
        const annKey = ann.id || ann.key || "";
        const libraryID =
          reader?._item?.libraryID || Zotero.Libraries?.userLibraryID;
        ContextManager.addContext({
          type: "annotation",
          text: text.slice(0, 1000),
          color: ann.color,
          page,
          itemKey: annKey || reader._item?.key,
          annotationKey: annKey,
          libraryID,
          source: reader._item?.getField?.("title") || "PDF 批注",
        });
        addedCount++;
      }
    }
    if (addedCount > 0) {
      ChatView.renderContexts();
      StandaloneWindow.refreshContexts();
      new ztoolkit.ProgressWindow(addon.data.config.addonName)
        .createLine({
          text: `已添加 ${addedCount} 条批注到 AGY 对话`,
          type: "success",
          progress: 100,
        })
        .show(2200);
    }
  }

  /** Add text selection to context */
  static addSelectionToContext(reader: any, params: any): void {
    const text = (params.annotation?.text || "").trim();
    if (text) {
      const page = (params.annotation?.pageIndex || 0) + 1;
      ContextManager.addContext({
        type: "selection",
        text: text.slice(0, 1000),
        page,
        itemKey: reader._item?.key,
        source: reader._item?.getField?.("title") || "PDF",
      });
      ChatView.renderContexts();
      StandaloneWindow.refreshContexts();
      new ztoolkit.ProgressWindow(addon.data.config.addonName)
        .createLine({
          text: `已添加选中文本 [第 ${page} 页] 到 AGY 对话`,
          type: "success",
          progress: 100,
        })
        .show(2200);
    }
  }

  /** Backwards compatibility alias */
  static registerTextSelectionPopup(): void {
    PDFSelection.registerReaderEvents();
  }

  /** Get selected text from active reader */
  static getSelectedText(): string | null {
    try {
      // @ts-ignore
      const reader = Zotero.Reader.getByTabID(Zotero_Tabs.selectedID);
      if (reader) {
        const selectedText = reader._iframeWindow?.document
          ?.getSelection?.()
          ?.toString?.();
        return selectedText || null;
      }
    } catch (e) {
      ztoolkit.log("Error getting selected text", e);
    }
    return null;
  }
}
