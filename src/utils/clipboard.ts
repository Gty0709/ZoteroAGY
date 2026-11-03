/**
 * Cross-platform clipboard and context menu utility for Zotero AGY.
 * Provides reliable Copy, Paste, Cut, Select All, and floating Context Menu
 * for both Standalone Window and Sidebar / Reader panels.
 */

export async function copyText(
  text: string,
  doc?: Document,
): Promise<boolean> {
  if (!text) return false;

  // 1. Zotero internal clipboard helper
  try {
    if ((Zotero as any)?.Utilities?.Internal?.copyTextToClipboard) {
      await (Zotero as any).Utilities.Internal.copyTextToClipboard(text);
      return true;
    }
  } catch (_) {}

  // 2. XPCOM nsIClipboardHelper
  try {
    const Ci = (Components as any)?.interfaces;
    const clipHelper = (Components as any)?.classes?.[
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
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}

  // 4. Fallback execCommand
  try {
    const globalDoc = (globalThis as any).document;
    const targetDoc =
      doc ||
      (globalDoc || (Zotero.getMainWindow() as any)?.document);
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
  // 1. XPCOM nsIClipboard + nsITransferable
  try {
    const Ci = (Components as any)?.interfaces;
    const clip = (Components as any)?.classes?.[
      "@mozilla.org/widget/clipboard;1"
    ]?.getService(Ci?.nsIClipboard);
    const trans = (Components as any)?.classes?.[
      "@mozilla.org/widget/transferable;1"
    ]?.createInstance(Ci?.nsITransferable);
    if (clip && trans) {
      if ("init" in trans) {
        trans.init(null);
      }
      trans.addDataFlavor("text/unicode");
      clip.getData(trans, clip.kGlobalClipboard);
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

  // 2. Modern navigator.clipboard API
  try {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav?.clipboard?.readText) {
      return await nav.clipboard.readText();
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

  // 1. Robust keyboard interception for Ctrl/Cmd + C, V, X, A in capture phase
  panel.addEventListener(
    "keydown",
    async (e: KeyboardEvent) => {
      const isAccel = (Zotero as any).isMac ? e.metaKey : e.ctrlKey;
      if (!isAccel) return;

      const key = e.key.toLowerCase();
      const activeEl = doc.activeElement as HTMLElement;
      const isInput =
        activeEl === inputEl ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLInputElement;

      // --- Ctrl + C (Copy) ---
      if (key === "c") {
        let textToCopy = "";
        if (isInput) {
          const input = activeEl as HTMLTextAreaElement | HTMLInputElement;
          const start = input.selectionStart ?? 0;
          const end = input.selectionEnd ?? 0;
          if (start !== end) {
            textToCopy = input.value.substring(start, end);
          }
        }
        if (!textToCopy) {
          const sel = win?.getSelection ? win.getSelection() : null;
          textToCopy = sel ? sel.toString() : "";
        }

        if (textToCopy) {
          e.preventDefault();
          e.stopPropagation();
          await copyText(textToCopy, doc);
        }
      }

      // --- Ctrl + V (Paste) ---
      else if (key === "v") {
        if (isInput) {
          e.preventDefault();
          e.stopPropagation();
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
        if (isInput) {
          const input = activeEl as HTMLTextAreaElement | HTMLInputElement;
          const start = input.selectionStart ?? 0;
          const end = input.selectionEnd ?? 0;
          if (start !== end) {
            e.preventDefault();
            e.stopPropagation();
            const cutText = input.value.substring(start, end);
            await copyText(cutText, doc);
            const val = input.value;
            input.value = val.substring(0, start) + val.substring(end);
            input.selectionStart = input.selectionEnd = start;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
      }

      // --- Ctrl + A (Select All) ---
      else if (key === "a") {
        if (isInput) {
          e.preventDefault();
          e.stopPropagation();
          const input = activeEl as HTMLTextAreaElement | HTMLInputElement;
          input.select();
        }
      }
    },
    true, // Capture phase ensures Zotero global keysets don't swallow clipboard shortcuts
  );

  // 2. Native copy event fallback
  panel.addEventListener("copy", async (e: ClipboardEvent) => {
    const sel = win?.getSelection ? win.getSelection() : null;
    const selText = sel ? sel.toString() : "";
    if (selText) {
      if (e.clipboardData) {
        e.clipboardData.setData("text/plain", selText);
        e.preventDefault();
      } else {
        await copyText(selText, doc);
      }
    }
  });

  // 3. Floating Right-Click Context Menu
  let menu = panel.querySelector(".agy-context-menu") as HTMLElement;
  if (!menu) {
    menu = doc.createElement("div");
    menu.className = "agy-context-menu";
    menu.style.display = "none";
    panel.appendChild(menu);
  }

  const hideMenu = () => {
    if (menu) menu.style.display = "none";
  };

  doc.addEventListener("click", hideMenu);
  doc.addEventListener("scroll", hideMenu, true);
  panel.addEventListener("scroll", hideMenu, true);

  panel.addEventListener("contextmenu", (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const sel = win?.getSelection ? win.getSelection() : null;
    const selText = sel ? sel.toString().trim() : "";
    const isInput =
      target === inputEl ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement;

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
      item.addEventListener("mousedown", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        hideMenu();
        await handler();
      });
      menu.appendChild(item);
      hasItems = true;
    };

    // If text is selected anywhere in panel or input
    if (selText) {
      addItem("📋", "复制 (Copy)", async () => {
        await copyText(selText, doc);
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
        addItem("✂️", "剪切 (Cut)", async () => {
          const cutText = input.value.substring(start, end);
          await copyText(cutText, doc);
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
      // General empty click menu option: Paste to chat if input exists
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
      e.clientX - panelRect.left,
      Math.max(10, panelRect.width - 180),
    );
    const y = Math.min(
      e.clientY - panelRect.top,
      Math.max(10, panelRect.height - 160),
    );

    menu.style.left = `${Math.max(4, x)}px`;
    menu.style.top = `${Math.max(4, y)}px`;
    menu.style.display = "block";

    e.preventDefault();
  });
}
