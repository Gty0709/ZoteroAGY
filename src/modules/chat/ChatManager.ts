import { ChatMessage, Conversation, ContextItem } from "../../addon";

export class ChatManager {
  static createConversation(): Conversation {
    const conv: Conversation = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: "新对话",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    addon.data.chat.conversations.set(conv.id, conv);
    addon.data.chat.activeConversationId = conv.id;
    ChatManager.saveConversations();
    return conv;
  }

  static getActiveConversation(): Conversation | null {
    const id = addon.data.chat.activeConversationId;
    if (!id) return null;
    return addon.data.chat.conversations.get(id) || null;
  }

  static addMessage(
    role: "user" | "assistant" | "system",
    content: string,
    contexts?: ContextItem[],
    tokens?: number,
    backend?: "agy" | "claude",
  ): ChatMessage {
    let conv = ChatManager.getActiveConversation();
    if (!conv) conv = ChatManager.createConversation();
    const msg: ChatMessage = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      role,
      content,
      timestamp: Date.now(),
      contexts,
      tokens,
      backend: backend || ChatManager.getActiveEngine(),
    };
    conv.messages.push(msg);
    conv.updatedAt = Date.now();
    if (conv.messages.length === 1 && role === "user") {
      ChatManager.updateTitleFromMessages(conv.id);
    }
    ChatManager.saveConversations();
    return msg;
  }

  static getActiveEngine(): "agy" | "claude" {
    try {
      const prefix =
        typeof addon !== "undefined" && addon?.data?.config?.prefsPrefix
          ? addon.data.config.prefsPrefix
          : "extensions.zoteroagy";
      const saved = Zotero.Prefs.get(
        `${prefix}.activeEngine`,
        true,
      ) as string;
      if (saved === "claude" || saved === "agy") {
        if (typeof addon !== "undefined" && addon?.data?.chat) {
          addon.data.chat.activeEngine = saved;
        }
        return saved;
      }
    } catch (_) {}
    return (
      (typeof addon !== "undefined" && addon?.data?.chat?.activeEngine) || "agy"
    );
  }

  static setActiveEngine(engine: "agy" | "claude"): void {
    if (typeof addon !== "undefined" && addon?.data?.chat) {
      addon.data.chat.activeEngine = engine;
    }
    try {
      const prefix =
        typeof addon !== "undefined" && addon?.data?.config?.prefsPrefix
          ? addon.data.config.prefsPrefix
          : "extensions.zoteroagy";
      Zotero.Prefs.set(`${prefix}.activeEngine`, engine, true);
    } catch (_) {}
  }

  static setClaudeSessionId(convId: string, sessionId: string): void {
    const conv = addon.data.chat.conversations.get(convId);
    if (conv) {
      conv.claudeSessionId = sessionId;
      ChatManager.saveConversations();
    }
  }

  static updateTitleFromMessages(convId: string): void {
    const conv = addon.data.chat.conversations.get(convId);
    if (!conv || conv.messages.length === 0) return;

    const firstUserMsg = conv.messages.find((m) => m.role === "user");
    if (!firstUserMsg) return;

    let raw = firstUserMsg.content;
    raw = raw.replace(
      /【系统(?:角色与科研执行准则|能力与指令)】[\s\S]*?(?=\[Active Context|\[当前研读文献|\[用户显式引用|--- 用户显式引用|\[Context Data|\[Context Information|\[User Question|\[User Request|$)/g,
      "",
    );
    raw = raw.replace(
      /\[当前研读文献[\s\S]*?(?=\[User Question|\[User Request|$)/g,
      "",
    );
    raw = raw.replace(
      /--- 用户显式引用[\s\S]*?(?=\[User Question|\[User Request|$)/g,
      "",
    );
    raw = raw.replace(
      /\[Active Context[\s\S]*?(?=\[User Question|\[User Request|$)/g,
      "",
    );
    raw = raw.replace(
      /\[Context Data[\s\S]*?(?=\[User Question|\[User Request|$)/g,
      "",
    );
    raw = raw.replace(
      /\[Context Information[\s\S]*?(?=\[User Question|\[User Request|$)/g,
      "",
    );
    raw = raw.replace(/\[User Question\]/g, "");
    raw = raw.replace(/\[User Request\]/g, "");
    raw = raw.replace(/#+\s+/g, "");
    raw = raw.replace(/[`*_\n\r]/g, " ");
    raw = raw.trim();

    if (raw) {
      conv.title = raw.slice(0, 22) + (raw.length > 22 ? "..." : "");
      ChatManager.saveConversations();
    }
  }

  static formatRelativeTime(ts: number): string {
    const now = Date.now();
    const diff = Math.max(0, now - ts);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return "刚刚";
    if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
    if (diff < day) return `${Math.floor(diff / hour)}小时前`;
    if (diff < 2 * day) return "昨天";
    if (diff < 7 * day) return `${Math.floor(diff / day)}天前`;

    const d = new Date(ts);
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  static setAgyConversationId(convId: string, agyConvId: string): void {
    const conv = addon.data.chat.conversations.get(convId);
    if (conv) {
      conv.agyConversationId = agyConvId;
      ChatManager.saveConversations();
    }
  }

  static getConversationHistory(): Conversation[] {
    return Array.from(addon.data.chat.conversations.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }

  static exportConversationToMarkdown(convId?: string): {
    title: string;
    markdown: string;
  } {
    const conv = convId
      ? addon.data.chat.conversations.get(convId)
      : ChatManager.getActiveConversation();
    if (!conv || conv.messages.length === 0) {
      return { title: "", markdown: "" };
    }

    const title = conv.title || "AGY学术对话";
    const pad = (n: number) => String(n).padStart(2, "0");
    const formatTime = (ts: number) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    let totalTokens = 0;
    let userTurns = 0;
    for (const m of conv.messages) {
      if (typeof m.tokens === "number") totalTokens += m.tokens;
      if (m.role === "user") userTurns++;
    }

    let md = `# 💬 ${title}\n\n`;
    md += `> - **导出时间**: ${formatTime(Date.now())}\n`;
    md += `> - **创建时间**: ${formatTime(conv.createdAt || Date.now())}\n`;
    md += `> - **更新时间**: ${formatTime(conv.updatedAt || Date.now())}\n`;
    md += `> - **问答轮次**: 共 ${userTurns} 轮提问 (${conv.messages.length} 条记录)\n`;
    if (totalTokens > 0) {
      md += `> - **总计消耗**: 约 ${totalTokens.toLocaleString()} tokens\n`;
    }
    md += `\n---\n\n`;

    let currentTurn = 0;
    for (const msg of conv.messages) {
      const timeStr = formatTime(msg.timestamp);
      if (msg.role === "user") {
        currentTurn++;
        md += `### 🧑 第 ${currentTurn} 轮提问 · 用户\n`;
        md += `<small>*时间: ${timeStr}${msg.tokens ? ` · 消耗约 ${msg.tokens} tokens` : ""}*</small>\n\n`;
        md += `${msg.content}\n\n`;

        if (msg.contexts && msg.contexts.length > 0) {
          md += `> **📌 关联文献 / 批注上下文**:\n`;
          for (const ctx of msg.contexts) {
            let typeLabel = "划词";
            if (ctx.type === "annotation") typeLabel = "批注";
            else if (ctx.type === "note") typeLabel = "笔记";
            else if (ctx.type === "title") typeLabel = "文献";
            else if (ctx.type === "abstract") typeLabel = "摘要";

            const pageStr = ctx.page ? ` (第 ${ctx.page} 页)` : "";
            const sourceStr = ctx.source ? ` [${ctx.source}]` : "";
            md += `> - **[${typeLabel}${pageStr}${sourceStr}]**: ${ctx.text.replace(/\r?\n+/g, " ")}\n`;
          }
          md += `\n`;
        }
      } else if (msg.role === "assistant") {
        const engineLabel =
          msg.backend === "claude" ? "Claude Code" : "Antigravity (AGY)";
        md += `### 🤖 第 ${currentTurn} 轮回答 · ${engineLabel}\n`;
        md += `<small>*时间: ${timeStr}${msg.tokens ? ` · 消耗约 ${msg.tokens} tokens` : ""}*</small>\n\n`;
        md += `${msg.content}\n\n`;
        md += `---\n\n`;
      } else if (msg.role === "system") {
        md += `> ℹ️ **系统信息**: ${msg.content}\n\n`;
      }
    }

    return { title, markdown: md };
  }

  static deleteConversation(id: string): void {
    addon.data.chat.conversations.delete(id);
    if (addon.data.chat.activeConversationId === id) {
      const remaining = Array.from(addon.data.chat.conversations.values()).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      );
      addon.data.chat.activeConversationId =
        remaining.length > 0 ? remaining[0].id : null;
    }
    ChatManager.saveConversations();
  }

  static setActiveConversation(id: string): void {
    addon.data.chat.activeConversationId = id;
  }

  static loadConversations(): void {
    try {
      const raw = Zotero.Prefs.get(
        `${addon.data.config.prefsPrefix}.conversations`,
        true,
      ) as string;
      if (raw) {
        const arr = JSON.parse(raw) as Conversation[];
        for (const conv of arr) {
          addon.data.chat.conversations.set(conv.id, conv);
        }
      }
    } catch (e) {
      ztoolkit.log("Failed to load conversations", e);
    }
  }

  private static saveConversations(): void {
    try {
      const arr = Array.from(addon.data.chat.conversations.values());
      const maxLen =
        (Zotero.Prefs.get(
          `${addon.data.config.prefsPrefix}.maxHistoryLength`,
          true,
        ) as number) || 50;
      const trimmed = arr
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, maxLen);
      Zotero.Prefs.set(
        `${addon.data.config.prefsPrefix}.conversations`,
        JSON.stringify(trimmed),
        true,
      );
    } catch (e) {
      ztoolkit.log("Failed to save conversations", e);
    }
  }
}
