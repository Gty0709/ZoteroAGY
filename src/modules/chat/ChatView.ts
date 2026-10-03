import { AGYClient } from "../api/AGYClient";
import { ChatManager } from "./ChatManager";
import { ContextManager } from "../context/ContextManager";
import { NoteWriter } from "../notes/NoteWriter";
import { NoteFormatter } from "../notes/NoteFormatter";
import { OAuthManager } from "../auth/OAuthManager";
import { StandaloneWindow } from "../window/StandaloneWindow";
import { debugLog } from "../../hooks";

const HTML_NS = "http://www.w3.org/1999/xhtml";

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  style?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElementNS(HTML_NS, tag) as HTMLElementTagNameMap[K];
  if (className) node.className = className;
  if (style) node.setAttribute("style", style);
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface AGYPanelInstance {
  doc: Document;
  panel: HTMLElement;
  messagesContainer: HTMLElement;
  contextContainer: HTMLElement;
  inputElement: HTMLTextAreaElement;
  sendButton: HTMLButtonElement;
  authStatusElement: HTMLElement;
  modelSelectElement: HTMLSelectElement;
  effortSelectElement?: HTMLSelectElement;
  pinButton?: HTMLElement;
  isStandalone?: boolean;
  historyDrawer?: HTMLElement;
  historyOverlay?: HTMLElement;
  historyList?: HTMLElement;
  fontSizeLabel?: HTMLElement;
}

export class ChatView {
  public static panels: Set<AGYPanelInstance> = new Set();
  private static isStreaming: boolean = false;

  public static init(body: HTMLElement, currentItem?: any): void {
    if (!body) return;
    const doc = body.ownerDocument;
    if (!doc) return;

    try {
      body.style.overflowAnchor = "none";
      body.style.minWidth = "0";
      body.style.width = "100%";
      body.style.maxWidth = "100%";
      body.style.boxSizing = "border-box";
      body.style.display = "flex";
      body.style.flexDirection = "column";
      body.style.minHeight = "520px";
      body.style.maxHeight = "none";
      body.style.opacity = "1";
      body.style.visibility = "visible";
      body.style.overflow = "visible";
    } catch (e) {}

    const section = body.closest("collapsible-section") as any;
    if (section) {
      try {
        section.removeAttribute("empty");
        section.empty = false;
        section.style.setProperty("--open-height", "auto", "important");
        section.setAttribute("open", "true");
        section.open = true;
        section.removeAttribute("no-collapse");
      } catch (e) {}
    }

    // Ensure stylesheet is attached
    const styleId = `${addon.data.config.addonRef}-styles`;
    if (!doc.getElementById(styleId)) {
      const link = doc.createElementNS(HTML_NS, "link") as HTMLLinkElement;
      link.id = styleId;
      link.rel = "stylesheet";
      link.type = "text/css";
      link.href = `chrome://${addon.data.config.addonRef}/content/zoteroPane.css`;
      doc.documentElement?.appendChild(link);
    }
    const katexStyleId = `${addon.data.config.addonRef}-katex-styles`;
    if (!doc.getElementById(katexStyleId)) {
      const link = doc.createElementNS(HTML_NS, "link") as HTMLLinkElement;
      link.id = katexStyleId;
      link.rel = "stylesheet";
      link.type = "text/css";
      link.href = `chrome://${addon.data.config.addonRef}/content/katex.min.css`;
      doc.documentElement?.appendChild(link);
    }

    try {
      const existingPanel = body.querySelector("#agy-main") as HTMLElement;
      if (!existingPanel) {
        const instance = ChatView.createPanel(doc, false);
        if (typeof body.replaceChildren === "function") {
          body.replaceChildren(instance.panel);
        } else {
          body.textContent = "";
          body.appendChild(instance.panel);
        }
        ChatView.renderHistoryForPanel(instance);
        ChatView.renderContextsForPanel(instance);
        ChatView.updateAuthStatusForPanel(instance);
      }
    } catch (e: any) {
      ztoolkit?.log?.("ChatView.init error:", e);
    }
  }

  public static createPanel(
    doc: Document,
    isStandalone: boolean = false,
  ): AGYPanelInstance {
    const currentFontSize = ChatView.getFontSize();
    if (doc.documentElement) {
      (doc.documentElement as HTMLElement).style?.setProperty(
        "--agy-font-size",
        `${currentFontSize}px`,
      );
    }

    const panel = el(
      doc,
      "div",
      "agy-panel",
      isStandalone
        ? `position: relative; display: flex; flex-direction: column; height: 100%; width: 100%; box-sizing: border-box; background: var(--material-background, #f9f9fa); overflow: hidden; --agy-font-size: ${currentFontSize}px;`
        : `position: relative; display: flex; flex-direction: column; height: 620px; width: 100%; box-sizing: border-box; background: var(--material-background, #f9f9fa); border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; overflow: hidden; --agy-font-size: ${currentFontSize}px;`,
    );
    panel.id = isStandalone ? "agy-standalone-main" : "agy-main";

    // Header
    const header = el(
      doc,
      "div",
      "agy-header",
      "display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--material-sidepanel-background, #ffffff); border-bottom: 1px solid rgba(0,0,0,0.08); flex-shrink: 0;",
    );
    const title = el(
      doc,
      "div",
      "agy-title",
      "font-weight: 600; display: flex; align-items: center; gap: 6px; color: #222;",
      "🤖 AGY 智能助手",
    );

    const actions = el(
      doc,
      "div",
      "agy-header-actions",
      "display: flex; align-items: center; gap: 6px;",
    );
    const authStatus = el(doc, "span", "agy-auth-status");

    // Font Zoom Controls (A- / A+)
    const zoomGroup = el(doc, "div", "agy-zoom-group");
    const zoomOutBtn = el(doc, "button", "agy-zoom-btn", "", "－");
    zoomOutBtn.title = "缩小字号";
    const fontSizeLabel = el(
      doc,
      "span",
      "agy-zoom-label",
      "",
      `${currentFontSize}px`,
    );
    const zoomInBtn = el(doc, "button", "agy-zoom-btn", "", "＋");
    zoomInBtn.title = "放大字号";

    zoomOutBtn.addEventListener("click", () => {
      ChatView.setFontSize(ChatView.getFontSize() - 1);
    });
    zoomInBtn.addEventListener("click", () => {
      ChatView.setFontSize(ChatView.getFontSize() + 1);
    });
    zoomGroup.append(zoomOutBtn, fontSizeLabel, zoomInBtn);

    // History Drawer Button
    const historyBtn = el(
      doc,
      "button",
      "agy-btn-icon",
      "background: transparent; border: 1px solid rgba(0,0,0,0.15); border-radius: 4px; cursor: pointer; padding: 2px 6px; display: inline-flex; align-items: center; gap: 3px; color: #333;",
      "📜 历史",
    );
    historyBtn.title = "查看与切换历史对话";

    let pinButton: HTMLElement | undefined;
    if (isStandalone) {
      const isPinned =
        Zotero.Prefs.get(
          `${addon.data.config.prefsPrefix}.keepWindowTop`,
          true,
        ) !== false;
      pinButton = el(
        doc,
        "button",
        "agy-pin-btn",
        `background: transparent; border: 1px solid ${isPinned ? "#188038" : "rgba(0,0,0,0.18)"}; color: ${isPinned ? "#188038" : "#666"}; cursor: pointer; font-weight: 500; padding: 2px 7px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;`,
        isPinned ? "📌 已置顶" : "📍 未置顶",
      );
      pinButton.title = isPinned
        ? "当前状态：已置顶在屏幕最前端（点击取消置顶）"
        : "当前状态：未置顶（点击开启屏幕置顶）";
      pinButton.addEventListener("click", () => {
        StandaloneWindow.togglePin();
      });
      actions.appendChild(pinButton);
    } else {
      // Popout button for sidebar panel
      const popoutBtn = el(
        doc,
        "button",
        "agy-btn-icon",
        "background: transparent; border: 1px solid rgba(0,0,0,0.15); border-radius: 4px; cursor: pointer; padding: 2px 6px; display: inline-flex; align-items: center; gap: 3px; color: #333;",
        "↗️ 独立浮窗",
      );
      popoutBtn.title = "弹出为独立置顶浮动窗口 (可随意拖动)";
      popoutBtn.addEventListener("click", () => {
        StandaloneWindow.open();
      });
      actions.appendChild(popoutBtn);
    }

    const clearBtn = el(
      doc,
      "button",
      "agy-btn-icon",
      "background: transparent; border: none; cursor: pointer; padding: 2px 6px; border-radius: 4px;",
      "🧹",
    );
    clearBtn.title = "清空对话 / 新对话";
    clearBtn.addEventListener("click", () => {
      ChatManager.createConversation();
      ContextManager.clearContexts();
      ChatView.renderContexts();
      ChatView.renderHistory();
      ChatView.refreshAllHistoryDrawers();
    });

    const settingsBtn = el(
      doc,
      "button",
      "agy-btn-icon",
      "background: transparent; border: none; cursor: pointer; padding: 2px 6px; border-radius: 4px;",
      "⚙️",
    );
    settingsBtn.title = "首选项配置";
    settingsBtn.addEventListener("click", () => ChatView.openPreferences());

    actions.prepend(authStatus);
    actions.append(zoomGroup, historyBtn, clearBtn, settingsBtn);
    header.append(title, actions);
    panel.appendChild(header);

    // Messages container
    const messages = el(
      doc,
      "div",
      "agy-messages",
      "flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; background: var(--material-background, #f9f9fa);",
    );
    messages.id = isStandalone
      ? "agy-standalone-messages-box"
      : "agy-messages-box";
    panel.appendChild(messages);

    // Contexts box
    const contextsBox = el(doc, "div", "agy-contexts-box", "display: none;");
    contextsBox.id = isStandalone
      ? "agy-standalone-contexts-box"
      : "agy-contexts-box";
    panel.appendChild(contextsBox);

    // Input section
    const inputSection = el(
      doc,
      "div",
      "agy-input-container",
      "padding: 8px 10px; background: var(--material-sidepanel-background, #ffffff); border-top: 1px solid rgba(0,0,0,0.08); display: flex; flex-direction: column; gap: 6px; flex-shrink: 0;",
    );
    const textarea = el(
      doc,
      "textarea",
      "agy-textarea",
      "width: 100%; min-height: 48px; max-height: 120px; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.2); box-sizing: border-box; font-family: inherit; resize: none; outline: none; background: #ffffff; color: #222;",
    );
    textarea.placeholder = "输入您的问题... (Enter 发送，Shift+Enter 换行)";
    textarea.rows = 2;

    const footer = el(
      doc,
      "div",
      "agy-input-footer",
      "display: flex; justify-content: space-between; align-items: center;",
    );

    // Selectors group: Model + Effort
    const selectorsGroup = el(doc, "div", "agy-selectors-group");

    const modelSelect = el(doc, "select", "agy-model-select");
    modelSelect.title = "选择模型 (Model)";
    const currentModel = AGYClient.getModel();
    for (const m of AGYClient.AVAILABLE_MODELS) {
      const opt = el(doc, "option", "", "", m.name);
      opt.value = m.id;
      if (m.id === currentModel) opt.selected = true;
      modelSelect.appendChild(opt);
    }

    const effortSelect = el(doc, "select", "agy-effort-select");

    const populateEffortOptions = (
      selectEl: HTMLSelectElement,
      modelId: string,
      targetEffort?: string,
    ) => {
      const modelDef = AGYClient.AVAILABLE_MODELS.find((m) => m.id === modelId);
      selectEl.innerHTML = "";
      if (!modelDef || modelDef.efforts.length === 0) {
        const opt = el(doc, "option", "", "", "内置思考");
        opt.value = "";
        selectEl.appendChild(opt);
        selectEl.disabled = true;
        selectEl.title = "当前模型不支持自定义思考强度";
        return;
      }
      selectEl.disabled = false;
      selectEl.title = "选择思考强度 (Reasoning Effort)";
      const activeEffort =
        targetEffort || AGYClient.getEffort() || modelDef.defaultEffort;
      for (const effId of modelDef.efforts) {
        const effMeta = AGYClient.AVAILABLE_EFFORTS.find((e) => e.id === effId);
        const opt = el(doc, "option", "", "", effMeta ? effMeta.name : effId);
        opt.value = effId;
        if (
          effId === activeEffort ||
          (!modelDef.efforts.includes(activeEffort) &&
            effId === modelDef.defaultEffort)
        ) {
          opt.selected = true;
        }
        selectEl.appendChild(opt);
      }
    };

    populateEffortOptions(effortSelect, currentModel, AGYClient.getEffort());

    modelSelect.addEventListener("change", (e: any) => {
      const newModel = e.target.value;
      AGYClient.setModel(newModel);
      const modelDef = AGYClient.AVAILABLE_MODELS.find(
        (m) => m.id === newModel,
      );
      let newEffort = AGYClient.getEffort();
      if (modelDef && modelDef.efforts.length > 0) {
        if (!modelDef.efforts.includes(newEffort)) {
          newEffort = modelDef.defaultEffort;
          AGYClient.setEffort(newEffort);
        }
      }
      populateEffortOptions(effortSelect, newModel, newEffort);

      // Sync across other panel instances
      for (const p of ChatView.panels) {
        if (p.modelSelectElement) p.modelSelectElement.value = newModel;
        if (p.effortSelectElement) {
          populateEffortOptions(p.effortSelectElement, newModel, newEffort);
        }
      }
    });

    effortSelect.addEventListener("change", (e: any) => {
      const newEffort = e.target.value;
      if (newEffort) {
        AGYClient.setEffort(newEffort);
        // Sync across other panel instances
        for (const p of ChatView.panels) {
          if (p.effortSelectElement && !p.effortSelectElement.disabled) {
            p.effortSelectElement.value = newEffort;
          }
        }
      }
    });

    selectorsGroup.append(modelSelect, effortSelect);
    const sendBtn = el(doc, "button", "agy-send-btn", "", "发送 ▶");

    footer.append(selectorsGroup, sendBtn);
    inputSection.append(textarea, footer);
    panel.appendChild(inputSection);

    // History Drawer DOM
    const overlay = el(doc, "div", "agy-drawer-overlay");
    const drawer = el(doc, "div", "agy-drawer");
    const drawerHeader = el(doc, "div", "agy-drawer-header");
    const drawerTitle = el(doc, "div", "agy-drawer-title", "", "💬 历史对话");

    const drawerActions = el(doc, "div", "agy-drawer-actions");
    const newChatBtn = el(doc, "button", "agy-drawer-new-btn", "", "＋ 新对话");
    newChatBtn.title = "开启新的对话";
    const closeDrawerBtn = el(doc, "button", "agy-drawer-close-btn", "", "✕");
    closeDrawerBtn.title = "关闭历史侧边栏";

    drawerActions.append(newChatBtn, closeDrawerBtn);
    drawerHeader.append(drawerTitle, drawerActions);

    const drawerList = el(doc, "div", "agy-drawer-list");
    drawer.append(drawerHeader, drawerList);

    panel.appendChild(overlay);
    panel.appendChild(drawer);

    const instance: AGYPanelInstance = {
      doc,
      panel,
      messagesContainer: messages,
      contextContainer: contextsBox,
      inputElement: textarea,
      sendButton: sendBtn,
      authStatusElement: authStatus,
      modelSelectElement: modelSelect,
      effortSelectElement: effortSelect,
      pinButton,
      isStandalone,
      historyDrawer: drawer,
      historyOverlay: overlay,
      historyList: drawerList,
      fontSizeLabel,
    };

    historyBtn.addEventListener("click", () => {
      const isOpen = drawer.classList.contains("open");
      if (isOpen) {
        drawer.classList.remove("open");
        overlay.classList.remove("open");
      } else {
        drawer.classList.add("open");
        overlay.classList.add("open");
        ChatView.renderHistoryDrawer(instance);
      }
    });

    closeDrawerBtn.addEventListener("click", () => {
      drawer.classList.remove("open");
      overlay.classList.remove("open");
    });

    overlay.addEventListener("click", () => {
      drawer.classList.remove("open");
      overlay.classList.remove("open");
    });

    newChatBtn.addEventListener("click", () => {
      ChatManager.createConversation();
      ContextManager.clearContexts();
      ChatView.renderContexts();
      ChatView.renderHistory();
      drawer.classList.remove("open");
      overlay.classList.remove("open");
      textarea.focus();
    });

    textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        ChatView.handleSend(instance);
      }
    });

    sendBtn.addEventListener("click", () => ChatView.handleSend(instance));

    ChatView.panels.add(instance);
    return instance;
  }

  public static removePanel(instance: AGYPanelInstance): void {
    ChatView.panels.delete(instance);
  }

  public static getFontSize(): number {
    try {
      const saved = Zotero.Prefs.get(
        `${addon.data.config.prefsPrefix}.fontSize`,
        true,
      );
      if (typeof saved === "number" && saved >= 12 && saved <= 28) {
        return saved;
      }
    } catch (_) {}
    return 14;
  }

  public static setFontSize(size: number): void {
    const clamped = Math.max(12, Math.min(28, size));
    try {
      Zotero.Prefs.set(
        `${addon.data.config.prefsPrefix}.fontSize`,
        clamped,
        true,
      );
    } catch (_) {}

    for (const p of ChatView.panels) {
      if (p.panel) {
        p.panel.style.setProperty("--agy-font-size", `${clamped}px`);
      }
      if (p.doc?.documentElement) {
        (p.doc.documentElement as HTMLElement).style?.setProperty(
          "--agy-font-size",
          `${clamped}px`,
        );
      }
      if (p.fontSizeLabel) {
        p.fontSizeLabel.textContent = `${clamped}px`;
      }
    }
  }

  public static renderHistoryDrawer(instance: AGYPanelInstance): void {
    if (!instance.historyList) return;
    const doc = instance.doc;
    const list = instance.historyList;
    list.textContent = "";

    const history = ChatManager.getConversationHistory();
    const activeConv = ChatManager.getActiveConversation();

    if (history.length === 0) {
      const emptyTip = el(doc, "div", "agy-drawer-empty", "", "暂无历史对话");
      list.appendChild(emptyTip);
      return;
    }

    for (const conv of history) {
      const isActive = activeConv?.id === conv.id;
      const item = el(
        doc,
        "div",
        `agy-history-item ${isActive ? "active" : ""}`,
      );
      item.setAttribute("data-conv-id", conv.id);

      const info = el(doc, "div", "agy-history-info");
      const titleEl = el(
        doc,
        "div",
        "agy-history-title",
        "",
        conv.title || "新对话",
      );
      titleEl.title = conv.title || "新对话";

      const metaEl = el(doc, "div", "agy-history-meta");
      const timeStr = ChatManager.formatRelativeTime(
        conv.updatedAt || conv.createdAt || Date.now(),
      );
      const countStr = `${conv.messages.length}条消息`;
      metaEl.textContent = `${timeStr} · ${countStr}`;

      info.append(titleEl, metaEl);

      const delBtn = el(doc, "button", "agy-history-del-btn", "", "🗑️");
      delBtn.title = "删除此对话";
      delBtn.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        ChatManager.deleteConversation(conv.id);
        ChatView.renderHistory();
        ChatView.refreshAllHistoryDrawers();
      });

      item.append(info, delBtn);

      item.addEventListener("click", () => {
        ChatManager.setActiveConversation(conv.id);
        ContextManager.clearContexts();
        ChatView.renderContexts();
        ChatView.renderHistory();
        instance.historyDrawer?.classList.remove("open");
        instance.historyOverlay?.classList.remove("open");
        instance.inputElement?.focus();
      });

      list.appendChild(item);
    }
  }

  public static refreshAllHistoryDrawers(): void {
    for (const p of ChatView.panels) {
      if (p.historyDrawer?.classList.contains("open")) {
        ChatView.renderHistoryDrawer(p);
      }
    }
  }

  public static async updateAuthStatus(): Promise<void> {
    for (const p of ChatView.panels) {
      await ChatView.updateAuthStatusForPanel(p);
    }
  }

  public static async updateAuthStatusForPanel(
    instance: AGYPanelInstance,
  ): Promise<void> {
    if (!instance.authStatusElement) return;
    const doc = instance.doc;
    instance.authStatusElement.textContent = "⏳ 检测 CLI...";

    const status = await AGYClient.checkCLIStatus();
    instance.authStatusElement.textContent = "";

    if (status.available) {
      const readySpan = el(doc, "span", "agy-cli-badge");
      readySpan.title = `Antigravity CLI 已就绪\n路径: ${status.path}\n点击测试连接`;
      readySpan.textContent = "🟢 AGY CLI";
      readySpan.addEventListener("click", () => OAuthManager.login());
      instance.authStatusElement.appendChild(readySpan);
    } else {
      const notFoundBtn = el(
        doc,
        "button",
        "agy-action-btn agy-cli-notfound",
        "",
        "🔴 未检测到 agy",
      );
      notFoundBtn.title = "点击打开首选项配置 agy.exe 路径";
      notFoundBtn.addEventListener("click", () => ChatView.openPreferences());
      instance.authStatusElement.appendChild(notFoundBtn);
    }
  }

  public static renderContexts(): void {
    for (const p of ChatView.panels) {
      ChatView.renderContextsForPanel(p);
    }
  }

  public static renderContextsForPanel(instance: AGYPanelInstance): void {
    if (!instance.contextContainer) return;
    const doc = instance.doc;
    const contexts = ContextManager.getContexts();

    instance.contextContainer.textContent = "";

    if (contexts.length === 0) {
      instance.contextContainer.style.display = "none";
      return;
    }

    instance.contextContainer.style.display = "flex";
    for (const ctx of contexts) {
      const tag = el(doc, "div", "agy-context-tag");
      tag.title = `[${ctx.type}] ${ctx.text}`;

      const label = el(
        doc,
        "span",
        "agy-context-label",
        "",
        `[${ctx.type === "annotation" ? "批注" : "划词"}${ctx.page ? ` p.${ctx.page}` : ""}] ${ctx.text.slice(0, 24)}`,
      );
      const close = el(doc, "span", "agy-context-close", "", "×");
      close.title = "移除此上下文";
      close.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        ContextManager.removeContext(ctx.id);
        ChatView.renderContexts();
      });

      tag.append(label, close);
      instance.contextContainer.appendChild(tag);
    }
  }

  public static renderHistory(): void {
    for (const p of ChatView.panels) {
      ChatView.renderHistoryForPanel(p);
    }
  }

  public static renderHistoryForPanel(instance: AGYPanelInstance): void {
    if (!instance.messagesContainer) return;
    instance.messagesContainer.textContent = "";
    const doc = instance.doc;

    const conversation = ChatManager.getActiveConversation();
    if (!conversation || conversation.messages.length === 0) {
      const emptyTip = el(doc, "div", "agy-empty-tip");
      emptyTip.innerHTML =
        "👋 你好！我是 AGY 智能助手。<br/>已连接本地 <strong>Antigravity CLI</strong>。<br/>在左边栏批注卡片上点击 <strong>✦</strong>，或在 PDF 中划词点击<strong>添加到 AGY</strong>，即可快速将内容带入问答。";
      instance.messagesContainer.appendChild(emptyTip);
      return;
    }

    for (const msg of conversation.messages) {
      ChatView.appendMessageDOM(
        instance,
        msg.role,
        msg.content,
        msg.id,
        msg.contexts,
      );
    }
    ChatView.scrollToBottom(instance);
  }

  private static async handleSend(
    triggerInstance: AGYPanelInstance,
  ): Promise<void> {
    if (ChatView.isStreaming) return;
    const text = triggerInstance.inputElement?.value.trim();
    if (!text) return;

    // Check CLI availability
    const status = await AGYClient.checkCLIStatus();
    if (!status.available) {
      const bubbleEl = ChatView.appendMessageDOM(
        triggerInstance,
        "assistant",
        "",
        Date.now().toString(36),
      );
      bubbleEl.innerHTML = `
        <div style="padding: 4px; line-height: 1.6; color: #d93025;">
          <p style="font-weight: 600; font-size: 13px; margin: 0 0 4px 0;">⚠️ 未检测到 Antigravity CLI (agy.exe)</p>
          <p style="font-size: 12px; color: #555; margin: 0 0 8px 0;">对话由本地 Antigravity CLI 驱动。请确保已安装 agy，或在首选项中手动指定 agy.exe 所在路径。</p>
          <button id="agy-open-cfg-btn" style="background: #2b7fff; color: white; border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 12px;">⚙️ 打开首选项配置</button>
        </div>
      `;
      bubbleEl
        .querySelector("#agy-open-cfg-btn")
        ?.addEventListener("click", () => ChatView.openPreferences());
      return;
    }

    triggerInstance.inputElement.value = "";
    const contexts = [...ContextManager.getContexts()];

    // Add user message to history
    const userMsg = ChatManager.addMessage("user", text, contexts);

    // Sync user message to all panels
    for (const p of ChatView.panels) {
      const emptyTip = p.messagesContainer?.querySelector(".agy-empty-tip");
      if (emptyTip) emptyTip.remove();
      ChatView.appendMessageDOM(p, "user", text, userMsg.id, contexts);
    }

    // Prepare full prompt with system instructions for tools & mermaid
    const systemCapabilities = [
      "【系统能力与指令】",
      "你是基于 Antigravity CLI 的学术研究助手 Zotero AGY。",
      "1. 联网搜索：当需要检索最新学术动态、专业概念或外部网页资料时，请主动调用 search_web 或 read_url_content。",
      "2. Zotero 本地库交互 (zotero-mcp)：已连接本地 Zotero MCP 服务。需要检索文献条目、获取论文元数据/全文、提取笔记或写入标签与笔记时，请主动调用 zotero-mcp 工具。",
      '3. 流程图与图表渲染：若需要用流程图、时序图或架构图解释概念与工作流，请输出 ```mermaid 代码块。注意：子图名称与节点文本均必须用双引号包裹（如 subgraph sub1 ["客户端 (Client)"]、A["用户请求 (Client)"]、[("数据库")]），以保证语法完全规范，界面会自动渲染为可视化矢量图表。',
      "4. 排版与公式：支持完整 Obsidian 风格语法、Callout 提示框以及 LaTeX 数学公式（$行内公式$、$$行间公式$$）。",
    ].join("\n");

    let fullPrompt = "";
    const contextText = ContextManager.formatContextsForPrompt();
    if (contextText) {
      fullPrompt = `${systemCapabilities}\n\n[Active Context / 选中文献或批注]\n${contextText}\n\n[User Question]\n${text}`;
    } else {
      fullPrompt = `${systemCapabilities}\n\n[User Question]\n${text}`;
    }

    const conversation = ChatManager.getActiveConversation();

    // Stream assistant response
    ChatView.isStreaming = true;
    for (const p of ChatView.panels) {
      if (p.sendButton) p.sendButton.disabled = true;
    }

    const responseMsgId = Date.now().toString(36);
    const bubbleElements: HTMLElement[] = [];
    for (const p of ChatView.panels) {
      bubbleElements.push(
        ChatView.appendMessageDOM(p, "assistant", "...", responseMsgId),
      );
    }

    let fullResponse = "";

    try {
      const result = await AGYClient.sendMessageStream(
        fullPrompt,
        (chunk, done) => {
          if (chunk) {
            fullResponse += chunk;
            for (let i = 0; i < bubbleElements.length; i++) {
              const b = bubbleElements[i];
              if (b && b.ownerDocument) {
                NoteFormatter.renderToDOM(
                  b.ownerDocument,
                  fullResponse,
                  b,
                  true,
                );
              }
            }
            for (const p of ChatView.panels) {
              ChatView.scrollToBottom(p);
            }
          }
        },
        conversation?.agyConversationId,
      );

      fullResponse = result.response;
      if (result.agyConversationId && conversation) {
        ChatManager.setAgyConversationId(
          conversation.id,
          result.agyConversationId,
        );
      }

      ChatManager.addMessage("assistant", fullResponse);
      if (conversation) {
        ChatManager.updateTitleFromMessages(conversation.id);
      }
      ChatView.refreshAllHistoryDrawers();

      for (const b of bubbleElements) {
        if (b && b.ownerDocument) {
          NoteFormatter.renderToDOM(b.ownerDocument, fullResponse, b, false);
          if (b.parentElement) {
            ChatView.attachActionButtons(
              b.ownerDocument,
              b.parentElement as HTMLElement,
              fullResponse,
              text,
              contexts,
            );
          }
        }
      }
    } catch (e: any) {
      debugLog("ChatView.handleSend ERROR: " + (e?.stack || e?.message || e));
      for (const b of bubbleElements) {
        if (b.ownerDocument) {
          NoteFormatter.renderToDOM(
            b.ownerDocument,
            `**[错误]** ${e.message}`,
            b,
            false,
          );
        }
      }
      ChatManager.addMessage("system", `Error: ${e.message}`);
      if (conversation) {
        ChatManager.updateTitleFromMessages(conversation.id);
      }
      ChatView.refreshAllHistoryDrawers();
    } finally {
      ChatView.isStreaming = false;
      for (const p of ChatView.panels) {
        if (p.sendButton) p.sendButton.disabled = false;
        ChatView.scrollToBottom(p);
      }
    }
  }

  private static appendMessageDOM(
    instance: AGYPanelInstance,
    role: string,
    content: string,
    msgId: string,
    contexts?: any[],
  ): HTMLElement {
    const doc = instance.doc;
    if (!instance.messagesContainer)
      return doc.createElementNS(HTML_NS, "div") as HTMLElement;

    const msgWrapper = el(doc, "div", `agy-msg agy-msg-${role}`);
    msgWrapper.setAttribute("data-id", msgId);

    const bubble = el(
      doc,
      "div",
      `agy-bubble ${role === "assistant" ? "agy-markdown" : ""}`,
    );
    if (role === "assistant") {
      if (content === "...") {
        bubble.textContent = "...";
      } else {
        NoteFormatter.renderToDOM(doc, content, bubble, false);
      }
    } else {
      bubble.textContent = content;
    }

    msgWrapper.appendChild(bubble);

    if (role === "assistant" && content !== "...") {
      ChatView.attachActionButtons(doc, msgWrapper, content, "", contexts);
    }

    instance.messagesContainer.appendChild(msgWrapper);
    ChatView.scrollToBottom(instance);
    return bubble;
  }

  private static attachActionButtons(
    doc: Document,
    msgWrapper: HTMLElement,
    answer: string,
    question: string = "",
    contexts?: any[],
  ): void {
    const existing = msgWrapper.querySelector(".agy-actions-bar");
    if (existing) existing.remove();

    const bar = el(
      doc,
      "div",
      "agy-actions-bar",
      "display: flex; gap: 6px; margin-top: 4px; padding-left: 2px;",
    );

    // Copy
    const copyBtn = el(doc, "button", "agy-action-btn", "", "📋 复制");
    copyBtn.addEventListener("click", async () => {
      // @ts-ignore
      await Zotero.Utilities.Internal.copyTextToClipboard(answer);
      copyBtn.textContent = "✅ 已复制";
      setTimeout(() => {
        copyBtn.textContent = "📋 复制";
      }, 2000);
    });

    // Save to note
    const noteBtn = el(doc, "button", "agy-action-btn", "", "📝 存到笔记");
    noteBtn.addEventListener("click", async () => {
      const selected = Zotero.getActiveZoteroPane()?.getSelectedItems() || [];
      if (selected.length === 0) {
        new ztoolkit.ProgressWindow(addon.data.config.addonName)
          .createLine({
            text: "请先在文献列表中选中一个条目",
            type: "error",
            progress: 100,
          })
          .show(-1);
        return;
      }
      const item = selected[0];
      try {
        if (item.isNote()) {
          await NoteWriter.appendToNote(
            item.id,
            NoteFormatter.createNoteHTML(
              question || "AI 问答",
              answer,
              contexts,
            ),
          );
        } else {
          await NoteWriter.saveResponseAsNote(
            item.id,
            question || "AI 问答",
            answer,
            contexts,
          );
        }
        noteBtn.textContent = "✅ 已存笔记";
        setTimeout(() => {
          noteBtn.textContent = "📝 存到笔记";
        }, 2000);
      } catch (err: any) {
        new ztoolkit.ProgressWindow(addon.data.config.addonName)
          .createLine({
            text: `保存失败: ${err.message}`,
            type: "error",
            progress: 100,
          })
          .show(-1);
      }
    });

    // Fill annotation card (💬 填入批注卡片)
    const fillCardBtn = el(
      doc,
      "button",
      "agy-action-btn",
      "",
      "💬 填入批注卡片",
    );
    fillCardBtn.title = "将此 AI 回答自动填充到左侧批注卡片的笔记/评论栏";
    fillCardBtn.addEventListener("click", async () => {
      await ChatView.fillAnnotationComment(answer, contexts, fillCardBtn);
    });

    bar.append(copyBtn, noteBtn, fillCardBtn);
    msgWrapper.appendChild(bar);
  }

  /**
   * Automatically fill AI response into the target annotation card's comment (笔记) in left sidebar.
   */
  public static async fillAnnotationComment(
    answer: string,
    contexts?: any[],
    btn?: HTMLElement,
  ): Promise<void> {
    try {
      debugLog("fillAnnotationComment invoked");
      let targetItem: any = null;
      let targetAnnKey = "";
      let targetLibId: number | undefined;

      // 1. Try finding from active contexts
      const activeContexts =
        contexts && contexts.length > 0
          ? contexts
          : ContextManager.getContexts();
      if (activeContexts && activeContexts.length > 0) {
        for (let i = activeContexts.length - 1; i >= 0; i--) {
          const c = activeContexts[i];
          if (c.type === "annotation" && (c.annotationKey || c.itemKey)) {
            targetAnnKey = c.annotationKey || c.itemKey || "";
            targetLibId = c.libraryID;
            break;
          }
        }
      }

      // 2. If not found in contexts, check active reader
      let reader: any = null;
      try {
        const zTabs =
          typeof (globalThis as any).Zotero_Tabs !== "undefined"
            ? (globalThis as any).Zotero_Tabs
            : null;
        reader =
          (Zotero.Reader as any)?.getByTabID?.(zTabs?.selectedID) ||
          (Zotero.Reader as any)?._readers?.[0];
      } catch (_) {}

      if (!targetAnnKey && reader) {
        const selectedIDs =
          reader.selectedAnnotationIDs ||
          reader._state?.selectedAnnotationIDs ||
          [];
        if (selectedIDs.length > 0) {
          targetAnnKey = selectedIDs[selectedIDs.length - 1];
          targetLibId = reader._item?.libraryID;
        } else if (
          reader._state?.annotations &&
          reader._state.annotations.length > 0
        ) {
          const allAnns = reader._state.annotations;
          targetAnnKey = allAnns[allAnns.length - 1]?.id;
          targetLibId = reader._item?.libraryID;
        }
      }

      // 3. Fetch annotation item from Zotero database
      if (targetAnnKey) {
        const libID =
          targetLibId ||
          reader?._item?.libraryID ||
          Zotero.Libraries?.userLibraryID;
        if (libID) {
          try {
            targetItem = await Zotero.Items.getByLibraryAndKeyAsync(
              libID,
              targetAnnKey,
            );
          } catch (_) {}
        }
        if (!targetItem) {
          try {
            const allLibs = Zotero.Libraries?.getAll?.() || [];
            for (const lib of allLibs) {
              targetItem = await Zotero.Items.getByLibraryAndKeyAsync(
                lib.id,
                targetAnnKey,
              );
              if (targetItem) break;
            }
          } catch (_) {}
        }
      }

      // 4. Fallback: check selected items in library view
      if (!targetItem) {
        try {
          const paneItems =
            Zotero.getActiveZoteroPane()?.getSelectedItems() || [];
          targetItem = paneItems.find((i: any) => i.isAnnotation?.());
        } catch (_) {}
      }

      if (!targetItem) {
        new ztoolkit.ProgressWindow(addon.data.config.addonName)
          .createLine({
            text: "未定位到目标批注卡片。请在左侧卡片点击 ✦ 添加到对话，或在 PDF 中选中一条批注！",
            type: "warning",
            progress: 100,
          })
          .show(3500);
        return;
      }

      // 5. Update annotationComment field and commit transaction
      const existingComment = (targetItem.annotationComment || "").trim();
      const newComment = existingComment
        ? `${existingComment}\n\n🤖 AGY:\n${answer}`
        : answer;
      targetItem.annotationComment = newComment;
      await targetItem.saveTx();
      debugLog(
        `fillAnnotationComment: successfully updated annotation ${targetItem.key}`,
      );

      // 6. Update PDF reader state & UI cards immediately
      if (reader) {
        try {
          reader.setAnnotations?.([targetItem]);
        } catch (_) {}
        try {
          if (reader._annotationManager?.updateAnnotations) {
            reader._annotationManager.updateAnnotations([
              {
                id: targetItem.key,
                comment: newComment,
              },
            ]);
          }
        } catch (_) {}
        try {
          const iframeDoc = reader._iframeWindow?.document;
          if (iframeDoc) {
            const cardHeader = iframeDoc
              .querySelector(`#page_${targetItem.key}`)
              ?.closest(".preview");
            if (cardHeader) {
              const commentEl = cardHeader.querySelector(".comment");
              if (commentEl) commentEl.textContent = newComment;
              const textareaEl = cardHeader.querySelector("textarea");
              if (textareaEl) textareaEl.value = newComment;
            }
          }
        } catch (_) {}
      }

      // 7. Visual button and toast feedback
      if (btn) {
        btn.textContent = "✅ 已填入卡片";
        btn.style.borderColor = "#188038";
        btn.style.color = "#188038";
        setTimeout(() => {
          btn.textContent = "💬 填入批注卡片";
          btn.style.borderColor = "rgba(0,0,0,0.15)";
          btn.style.color = "#555";
        }, 2500);
      }

      new ztoolkit.ProgressWindow(addon.data.config.addonName)
        .createLine({
          text: `✅ 已成功填入批注卡片 [${targetItem.key}] 笔记！`,
          type: "success",
          progress: 100,
        })
        .show(2500);
    } catch (err: any) {
      debugLog(
        "fillAnnotationComment error: " + (err?.stack || err?.message || err),
      );
      new ztoolkit.ProgressWindow(addon.data.config.addonName)
        .createLine({
          text: `填入失败: ${err?.message || err}`,
          type: "error",
          progress: 100,
        })
        .show(3000);
    }
  }

  public static openPreferences(): void {
    try {
      // @ts-ignore
      if (Zotero.Utilities?.Internal?.openPreferences) {
        // @ts-ignore
        Zotero.Utilities.Internal.openPreferences(
          `${addon.data.config.addonRef}-preferences`,
        );
      } else if ((Zotero as any).openPreferences) {
        (Zotero as any).openPreferences(
          `${addon.data.config.addonRef}-preferences`,
        );
      }
    } catch (e) {
      try {
        // @ts-ignore
        Zotero.Utilities?.Internal?.openPreferences?.();
      } catch (_) {}
    }
  }

  private static scrollToBottom(instance: AGYPanelInstance): void {
    if (instance.messagesContainer) {
      instance.messagesContainer.scrollTop =
        instance.messagesContainer.scrollHeight;
    }
  }
}
