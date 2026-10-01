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
  ): ChatMessage {
    let conv = ChatManager.getActiveConversation();
    if (!conv) conv = ChatManager.createConversation();
    const msg: ChatMessage = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      role,
      content,
      timestamp: Date.now(),
      contexts,
    };
    conv.messages.push(msg);
    conv.updatedAt = Date.now();
    if (conv.messages.length === 1 && role === "user") {
      ChatManager.updateTitleFromMessages(conv.id);
    }
    ChatManager.saveConversations();
    return msg;
  }

  static updateTitleFromMessages(convId: string): void {
    const conv = addon.data.chat.conversations.get(convId);
    if (!conv || conv.messages.length === 0) return;

    const firstUserMsg = conv.messages.find((m) => m.role === "user");
    if (!firstUserMsg) return;

    let raw = firstUserMsg.content;
    raw = raw.replace(
      /【系统能力与指令】[\s\S]*?(?=\[Active Context|\[User Question|$)/g,
      "",
    );
    raw = raw.replace(/\[Active Context.*?\]/gs, "");
    raw = raw.replace(/\[User Question\]/g, "");
    raw = raw.replace(/\[Context Information.*?\]/gs, "");
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
