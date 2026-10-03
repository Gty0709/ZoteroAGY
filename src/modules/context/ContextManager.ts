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
    let prompt =
      "\n--- 用户显式引用的上下文与批注 (User Selected Contexts) ---\n";
    for (const ctx of addon.data.chat.contexts) {
      const source = ctx.source
        ? ` (来自: ${ctx.source}` +
          (ctx.page ? `, 第 ${ctx.page} 页` : "") +
          ")"
        : "";
      const keyInfo = ctx.itemKey ? ` [Zotero ItemKey: ${ctx.itemKey}]` : "";
      prompt += `[${ctx.type}]${source}${keyInfo}: "${ctx.text}"\n`;
    }
    prompt +=
      "\n【执行指令】上述内容为用户特别选定的文献、笔记或批注上下文。若需获取全文正文，请使用上述条目的 Zotero ItemKey 主动调用 zotero_item_fulltext(item_key=...)。回答必须严格忠实于原文及笔记！\n";
    return prompt;
  }

  /** Detect currently active item or open PDF reader and return its context */
  static async getActiveItemContext(): Promise<string> {
    try {
      let targetItem: Zotero.Item | null = null;
      // 1. Check active reader
      const zTabs =
        typeof (globalThis as any).Zotero_Tabs !== "undefined"
          ? (globalThis as any).Zotero_Tabs
          : null;
      const reader =
        (Zotero.Reader as any)?.getByTabID?.(zTabs?.selectedID) ||
        (Zotero.Reader as any)?._readers?.[0];

      if (reader?._item) {
        if (reader._item.isRegularItem()) {
          targetItem = reader._item;
        } else if (reader._item.parentID) {
          targetItem = (await Zotero.Items.getAsync(
            reader._item.parentID,
          )) as Zotero.Item;
        }
      }

      // 2. If no reader, check selected items in active pane
      if (!targetItem) {
        const selected = Zotero.getActiveZoteroPane()?.getSelectedItems() || [];
        for (const it of selected) {
          if (it.isRegularItem()) {
            targetItem = it;
            break;
          } else if (it.isNote() && it.parentID) {
            targetItem = (await Zotero.Items.getAsync(
              it.parentID,
            )) as Zotero.Item;
            break;
          }
        }
      }

      if (!targetItem) return "";

      const title = (targetItem.getField("title") as string) || "";
      const creators =
        targetItem
          .getCreators?.()
          ?.map((c: any) => `${c.firstName || ""} ${c.lastName || ""}`.trim())
          .filter(Boolean)
          .join(", ") || "";
      const date = (targetItem.getField("date") as string) || "";
      const doi = (targetItem.getField("DOI") as string) || "";
      const url = (targetItem.getField("url") as string) || "";
      const abstract = (targetItem.getField("abstractNote") as string) || "";
      const itemKey = targetItem.key;

      let info = `[当前研读文献与笔记 (Active Zotero Document)]\n`;
      info += `- 论文标题 (Title): ${title}\n`;
      info += `- Zotero ItemKey: ${itemKey} (重要：可直接调用 zotero_item_fulltext(item_key="${itemKey}") 获取全文，zotero_item_metadata 获取元数据)\n`;
      if (creators) info += `- 作者 (Authors): ${creators}\n`;
      if (date) info += `- 年份 (Date): ${date}\n`;
      if (doi) info += `- DOI: ${doi}\n`;
      if (url) info += `- URL: ${url}\n`;
      if (abstract) {
        info += `- 摘要 (Abstract): ${abstract.slice(0, 800)}\n`;
      }

      // Fetch attached child notes
      const noteIDs = targetItem.getNotes?.() || [];
      if (noteIDs.length > 0) {
        info += `- 附带的文献笔记 (Notes):\n`;
        for (const nId of noteIDs.slice(0, 5)) {
          try {
            const nItem = await Zotero.Items.getAsync(nId);
            if (nItem && nItem.isNote()) {
              const raw = (nItem.getNote() as string) || "";
              const clean = raw
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();
              if (clean) {
                info += `  * [NoteKey: ${nItem.key}]: ${clean.slice(0, 500)}\n`;
              }
            }
          } catch (_) {}
        }
      }

      info += `\n【执行指令】用户当前正在阅读/选定此文献。若回答涉及该论文的方法、架构、公式或实验细节，必须强制调用 zotero_item_fulltext 提取全文求证，深度结合上述笔记。若涉及开源代码，必须检索官方开源代码仓库核实源码，绝对忠于原文！`;

      return info;
    } catch (_) {
      return "";
    }
  }

  /** Auto-add title, abstract, notes, and annotations of an item */
  static async addAutoContext(itemId: number): Promise<void> {
    const item = (await Zotero.Items.getAsync(itemId)) as Zotero.Item;
    if (!item) return;
    const title = item.getField("title") as string;
    if (title) {
      ContextManager.addContext({
        type: "title",
        text: title,
        itemKey: item.key,
        source: `文献条目 [ItemKey: ${item.key}]`,
      });
    }
    const abstract = item.getField("abstractNote") as string;
    if (abstract) {
      ContextManager.addContext({
        type: "abstract",
        text: abstract,
        itemKey: item.key,
        source: title || "文献摘要",
      });
    }

    // Auto-add attached notes
    try {
      const noteIDs = item.getNotes?.() || [];
      for (const nId of noteIDs) {
        const nItem = await Zotero.Items.getAsync(nId);
        if (nItem && nItem.isNote()) {
          const raw = (nItem.getNote() as string) || "";
          const clean = raw
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (clean) {
            ContextManager.addContext({
              type: "note",
              text: clean.slice(0, 2000),
              itemKey: nItem.key,
              source: `文献笔记 (${(title || "").slice(0, 20)})`,
            });
          }
        }
      }
    } catch (_) {}

    // Auto-add PDF annotations (highlights / comments)
    try {
      const attIDs = item.getAttachments?.() || [];
      for (const aId of attIDs) {
        const att = await Zotero.Items.getAsync(aId);
        if (att && att.isAttachment() && (att as any).isPDFAttachment?.()) {
          const annotations = (att as any).getAnnotations
            ? (att as any).getAnnotations()
            : [];
          for (const ann of annotations) {
            const annText = ann.annotationText || ann.annotationComment || "";
            if (annText) {
              ContextManager.addContext({
                type: "annotation",
                text: annText.slice(0, 1000),
                itemKey: ann.key,
                page: ann.annotationPosition
                  ? JSON.parse(ann.annotationPosition)?.pageIndex + 1
                  : undefined,
                source: `PDF批注 (${(title || "").slice(0, 20)})`,
              });
            }
          }
        }
      }
    } catch (_) {}
  }
}
