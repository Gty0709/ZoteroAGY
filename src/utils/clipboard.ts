/**
 * Cross-platform clipboard and context menu utility for Zotero AGY.
 * Provides reliable Copy, Paste, Cut, Select All, and floating Context Menu
 * for both Standalone Window and Sidebar / Reader panels.
 */

export function copyText(
  text: string,
  doc?: Document,
): boolean {
  if (!text) return false;

  // 1. Zotero native internal clipboard helper (synchronous, reliable across all platforms)
  try {
    const util = (Zotero as any)?.Utilities?.Internal;
    if (util?.copyTextToClipboard) {
      util.copyTextToClipboard(text);
      return true;
    }
  } catch (_) {}

  // 2. XPCOM nsIClipboardHelper
  try {
    const Ci = (Components as any)?.interfaces;
    const Cc = (Components as any)?.classes;
    const clipHelper = Cc?.[
      "@mozilla.org/widget/clipboardhelper;1"
    ]?.getService(Ci?.nsIClipboardHelper);
    if (clipHelper) {
      clipHelper.copyString(text);
      return true;
    }
  } catch (_) {}

  // 3. Modern navigator.clipboard API
  try {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav?.clipboard?.writeText) {
      nav.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}

  // 4. Fallback execCommand
  try {
    const globalDoc = (globalThis as any).document;
    const targetDoc =
      doc || (globalDoc || (Zotero.getMainWindow() as any)?.document);
    if (targetDoc) {
      const el = targetDoc.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      targetDoc.body.appendChild(el);
      el.select();
      const ok = targetDoc.execCommand("copy");
      targetDoc.body.removeChild(el);
      if (ok) return true;
    }
  } catch (_) {}

  return false;
}

export async function pasteText(): Promise<string> {
  // 1. Zotero native internal clipboard getter
  try {
    const util = (Zotero as any)?.Utilities?.Internal;
    if (util?.getClipboard) {
      let text = util.getClipboard("text/unicode");
      if (!text) {
        text = util.getClipboard("text/plain");
      }
      if (typeof text === "string" && text.length > 0) {
        return text;
      }
    }
  } catch (_) {}

  // 2. XPCOM nsIClipboard
  try {
    const Ci = (Components as any)?.interfaces;
    const Cc = (Components as any)?.classes;
    const clip = Cc?.["@mozilla.org/widget/clipboard;1"]?.getService(Ci?.nsIClipboard);
    const trans = Cc?.["@mozilla.org/widget/transferable;1"]?.createInstance(Ci?.nsITransferable);
    if (clip && trans) {
      try {
        (trans as any).init?.(null);
      } catch (_) {}
      trans.addDataFlavor("text/unicode");
      clip.getData(trans, 1); // 1 = kGlobalClipboard
      const data: any = {};
      trans.getTransferData("text/unicode", data);
      if (data.value) {
        const str = data.value.QueryInterface(Ci.nsISupportsString);
        if (str && typeof str.data === "string") {
          return str.data;
        }
      }
    }
  } catch (_) {}

  // 3. Modern navigator.clipboard API
  try {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav?.clipboard?.readText) {
      const text = await nav.clipboard.readText();
      if (text) return text;
    }
  } catch (_) {}

  return "";
}

export function getSelectedText(doc: Document, activeEl?: HTMLElement): string {
  // 1. If active element is a text input or textarea
  if (
    activeEl instanceof HTMLTextAreaElement ||
    activeEl instanceof HTMLInputElement
  ) {
    const start = activeEl.selectionStart ?? 0;
    const end = activeEl.selectionEnd ?? 0;
    if (start !== end) {
      return activeEl.value.substring(start, end);
    }
  }

  // 2. Document selection
  try {
    const docSel = doc.getSelection ? doc.getSelection() : null;
    if (docSel && docSel.toString().trim()) {
      return docSel.toString();
    }
  } catch (_) {}

  // 3. Window selection
  try {
    const win = doc.defaultView || (Zotero.getMainWindow() as any);
    const winSel = win?.getSelection ? win.getSelection() : null;
    if (winSel && winSel.toString().trim()) {
      return winSel.toString();
    }
  } catch (_) {}

  return "";
}

export function setupClipboardAndContextMenu(
  doc: Document,
  panel: HTMLElement,
  inputEl: HTMLTextAreaElement,
): void {
  const win = doc.defaultView || (Zotero.getMainWindow() as any);

  // Make panel focusable so clicks anywhere inside panel bring DOM focus into panel
  panel.setAttribute("tabindex", "-1");
  panel.style.outline = "none";
  panel.addEventListener("mousedown", (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target !== inputEl &&
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLTextAreaElement)
    ) {
      // Focus panel so keyboard events route directly to panel rather than outer Zotero chrome
      const active = doc.activeElement;
      if (!active || !panel.contains(active)) {
        panel.focus();
      }
    }
  });

  // Global capture-phase shortcut listener
  const handleKeydown = async (e: KeyboardEvent) => {
    const isAccel = (Zotero as any).isMac ? e.metaKey : e.ctrlKey;
    if (!isAccel) return;

    const key = e.key.toLowerCase();
    const activeEl = doc.activeElement as HTMLElement;

    // Check if there is an active selection inside panel
    const sel = doc.getSelection
      ? doc.getSelection()
      : win?.getSelection
      ? win.getSelection()
      : null;

    let panelHasSelection = false;
    let selectedText = "";
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      try {
        const range = sel.getRangeAt(0);
        const ancestor = range.commonAncestorContainer;
        if (
          panel.contains(ancestor) ||
          panel.contains(range.startContainer) ||
          panel === ancestor
        ) {
          panelHasSelection = true;
          selectedText = sel.toString();
        }
      } catch (_) {}
    }

    const isInputFocused =
      activeEl === inputEl ||
      (panel.contains(activeEl) &&
        (activeEl instanceof HTMLTextAreaElement ||
          activeEl instanceof HTMLInputElement));

    // --- Ctrl + C (Copy) ---
    if (key === "c") {
      let textToCopy = "";
      if (isInputFocused) {
        const input = activeEl as HTMLTextAreaElement | HTMLInputElement;
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        if (start !== end) {
          textToCopy = input.value.substring(start, end);
        }
      }
      if (!textToCopy && panelHasSelection) {
        textToCopy = selectedText;
      }
      if (!textToCopy && (panel.contains(activeEl) || activeEl === panel)) {
        textToCopy = getSelectedText(doc);
      }

      if (textToCopy) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        copyText(textToCopy, doc);
      }
    }

    // --- Ctrl + V (Paste) ---
    else if (key === "v") {
      if (isInputFocused) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const input = activeEl as HTMLTextAreaElement | HTMLInputElement;
        const clipText = await pasteText();
        if (clipText) {
          const start = input.selectionStart ?? input.value.length;
          const end = input.selectionEnd ?? input.value.length;
          const val = input.value;
          input.value = val.substring(0, start) + clipText + val.substring(end);
          input.selectionStart = input.selectionEnd = start + clipText.length;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    }

    // --- Ctrl + X (Cut) ---
    else if (key === "x") {
      if (isInputFocused) {
        const input = activeEl as HTMLTextAreaElement | HTMLInputElement;
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        if (start !== end) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const cutText = input.value.substring(start, end);
          copyText(cutText, doc);
          const val = input.value;
          input.value = val.substring(0, start) + val.substring(end);
          input.selectionStart = input.selectionEnd = start;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    }

    // --- Ctrl + A (Select All) ---
    else if (key === "a") {
      if (isInputFocused) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const input = activeEl as HTMLTextAreaElement | HTMLInputElement;
        input.select();
      }
    }
  };

  // Attach keydown listener to panel, document, and window in CAPTURE phase (useCapture: true)
  panel.addEventListener("keydown", handleKeydown, true);
  doc.addEventListener("keydown", handleKeydown, true);
  if (win && win !== doc.defaultView) {
    try {
      win.addEventListener("keydown", handleKeydown, true);
    } catch (_) {}
  }

  // Native copy event fallback
  panel.addEventListener("copy", (e: ClipboardEvent) => {
    const textToCopy = getSelectedText(doc);
    if (textToCopy) {
      if (e.clipboardData) {
        e.clipboardData.setData("text/plain", textToCopy);
        e.preventDefault();
      } else {
        copyText(textToCopy, doc);
      }
    }
  });

  // Floating Right-Click Context Menu
  let menu = panel.querySelector(".agy-context-menu") as HTMLElement;
  if (!menu) {
    menu = doc.createElement("div");
    menu.className = "agy-context-menu";
    menu.style.display = "none";
    panel.appendChild(menu);
  }

  const hideMenu = () => {
    if (menu && menu.style.display !== "none") {
      menu.style.display = "none";
      menu.innerHTML = "";
    }
  };

  // Close context menu on ANY mousedown/pointerdown anywhere, Escape, blur, scroll
  const onPointerDown = (e: Event) => {
    if (menu && !menu.contains(e.target as Node)) {
      hideMenu();
    }
  };

  if (win) {
    win.addEventListener("pointerdown", onPointerDown, true);
    win.addEventListener("mousedown", onPointerDown, true);
    win.addEventListener(
      "keydown",
      (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          hideMenu();
        }
      },
      true,
    );
    win.addEventListener("blur", hideMenu, true);
    win.addEventListener("scroll", hideMenu, true);
  }

  doc.addEventListener("pointerdown", onPointerDown, true);
  doc.addEventListener("mousedown", onPointerDown, true);
  panel.addEventListener("scroll", hideMenu, true);

  // Right-click contextmenu event
  panel.addEventListener("contextmenu", (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInput =
      target === inputEl ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement;

    const selText = getSelectedText(doc, isInput ? target : undefined).trim();

    menu.innerHTML = "";
    let hasItems = false;

    const addItem = (
      icon: string,
      label: string,
      handler: () => void | Promise<void>,
    ) => {
      const item = doc.createElement("div");
      item.className = "agy-context-menu-item";
      item.innerHTML = `<span class="agy-context-menu-icon">${icon}</span><span>${label}</span>`;
      item.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        hideMenu();
        try {
          await handler();
        } catch (_) {}
      });
      menu.appendChild(item);
      hasItems = true;
    };

    // If text is selected anywhere
    if (selText) {
      addItem("📋", "复制 (Copy)", () => {
        copyText(selText, doc);
      });
      addItem("💬", "引用到输入框 (Quote to Chat)", () => {
        if (inputEl) {
          const quote = `> ${selText}\n\n`;
          inputEl.value = quote + inputEl.value;
          inputEl.focus();
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
    }

    // Input-specific menu items
    if (isInput) {
      const input = target as HTMLTextAreaElement | HTMLInputElement;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const hasInputSel = start !== end;

      if (hasInputSel) {
        addItem("✂️", "剪切 (Cut)", () => {
          const cutText = input.value.substring(start, end);
          copyText(cutText, doc);
          const val = input.value;
          input.value = val.substring(0, start) + val.substring(end);
          input.selectionStart = input.selectionEnd = start;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
      }

      addItem("📋", "粘贴 (Paste)", async () => {
        const text = await pasteText();
        if (text) {
          const s = input.selectionStart ?? input.value.length;
          const ed = input.selectionEnd ?? input.value.length;
          const val = input.value;
          input.value = val.substring(0, s) + text + val.substring(ed);
          input.selectionStart = input.selectionEnd = s + text.length;
          input.focus();
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });

      addItem("🔲", "全选 (Select All)", () => {
        input.select();
      });

      if (input.value) {
        addItem("🧹", "清空 (Clear)", () => {
          input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
      }
    }

    if (!hasItems) {
      addItem("📋", "粘贴至输入框", async () => {
        const text = await pasteText();
        if (text && inputEl) {
          inputEl.value += text;
          inputEl.focus();
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
    }

    // Position menu within panel bounds
    const panelRect = panel.getBoundingClientRect();
    const x = Math.min(
      Math.max(10, e.clientX - panelRect.left),
      Math.max(10, panelRect.width - 180),
    );
    const y = Math.min(
      Math.max(10, e.clientY - panelRect.top),
      Math.max(10, panelRect.height - 180),
    );

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = "block";

    e.preventDefault();
  });
}
