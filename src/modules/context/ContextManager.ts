import { ContextItem } from "../../addon";

export class ContextManager {
  /** Add a context item */
  static addContext(item: Omit<ContextItem, "id">): ContextItem {
    const ctx: ContextItem = {
      ...item,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    };
    addon.data.chat.contexts.push(ctx);
    // Notify sidebar
    if (addon.data.sidebar.browser?.contentWindow) {
      addon.data.sidebar.browser.contentWindow.postMessage(
        {
          type: "add-context",
          context: {
            ...ctx,
            title:
              (ctx.source ? `[${ctx.source}] ` : "") +
              (ctx.text.slice(0, 25) + (ctx.text.length > 25 ? "..." : "")),
          },
          data: ctx,
        },
        "*",
      );
    }
    // Direct notify to ChatView
    try {
      // @ts-ignore
      const { ChatView } = require("../chat/ChatView");
      ChatView.renderContexts();
    } catch (e) {}
    return ctx;
  }

  /** Remove context by id */
  static removeContext(id: string): void {
    addon.data.chat.contexts = addon.data.chat.contexts.filter(
      (c) => c.id !== id,
    );
    try {
      const { ChatView } = require("../chat/ChatView");
      ChatView.renderContexts();
    } catch (e) {}
  }

  /** Get all contexts */
  static getContexts(): ContextItem[] {
    return addon.data.chat.contexts;
  }

  /** Clear all */
  static clearContexts(): void {
    addon.data.chat.contexts = [];
    if (addon.data.sidebar.browser?.contentWindow) {
      addon.data.sidebar.browser.contentWindow.postMessage(
        { type: "clear-contexts" },
        "*",
      );
    }
  }

  /** Format contexts for AI prompt */
  static formatContextsForPrompt(): string {
    if (addon.data.chat.contexts.length === 0) return "";
    let prompt = "\n\n--- Referenced Context ---\n";
    for (const ctx of addon.data.chat.contexts) {
      const source = ctx.source
        ? ` (from: ${ctx.source}` + (ctx.page ? `, page ${ctx.page}` : "") + ")"
        : "";
      prompt += `[${ctx.type}]${source}: "${ctx.text}"\n`;
    }
    return prompt;
  }

  /** Auto-add title and abstract of an item */
  static async addAutoContext(itemId: number): Promise<void> {
    const item = (await Zotero.Items.getAsync(itemId)) as Zotero.Item;
    if (!item) return;
    const title = item.getField("title") as string;
    if (title) {
      ContextManager.addContext({
        type: "title",
        text: title,
        itemKey: item.key,
      });
    }
    const abstract = item.getField("abstractNote") as string;
    if (abstract) {
      ContextManager.addContext({
        type: "abstract",
        text: abstract,
        itemKey: item.key,
      });
    }
  }
}
