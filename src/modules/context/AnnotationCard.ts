import { ContextManager } from "./ContextManager";

export class AnnotationCard {
  /** Register annotation context menu items */
  static registerAnnotationMenu(): void {
    // Right-click on items in library
    ztoolkit.Menu.register("item", {
      tag: "menu",
      label: "ZoteroAGY",
      icon: `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`,
      children: [
        {
          tag: "menuitem",
          label: "添加到 AGY 对话",
          commandListener: async () => {
            const items =
              Zotero.getActiveZoteroPane()?.getSelectedItems() || [];
            for (const item of items) {
              if (item.isRegularItem()) {
                await ContextManager.addAutoContext(item.id);
              } else if (item.isNote()) {
                const raw = (item.getNote() as string) || "";
                const text = raw
                  .replace(/<[^>]+>/g, " ")
                  .replace(/\s+/g, " ")
                  .trim();
                if (text) {
                  ContextManager.addContext({
                    type: "note",
                    text: text.slice(0, 2000),
                    itemKey: item.key,
                    source: "Zotero 笔记",
                  });
                }
              } else if (item.isAnnotation?.()) {
                const text =
                  item.annotationText || item.annotationComment || "";
                if (text) {
                  ContextManager.addContext({
                    type: "annotation",
                    text: text.slice(0, 500),
                    color: item.annotationColor || undefined,
                    page: item.annotationPosition
                      ? JSON.parse(item.annotationPosition)?.pageIndex + 1
                      : undefined,
                    itemKey: item.key,
                  });
                }
              }
            }
            new ztoolkit.ProgressWindow(addon.data.config.addonName)
              .createLine({
                text: "已添加到对话上下文",
                type: "success",
                progress: 100,
              })
              .show(-1);
          },
        },
        {
          tag: "menuitem",
          label: "AGY: 生成摘要",
          commandListener: async () => {
            const items =
              Zotero.getActiveZoteroPane()?.getSelectedItems() || [];
            for (const item of items) {
              if (item.isRegularItem()) {
                const pw = new ztoolkit.ProgressWindow(
                  addon.data.config.addonName,
                )
                  .createLine({
                    text: "正在生成摘要...",
                    type: "default",
                    progress: 50,
                  })
                  .show();
                try {
                  const { Summarizer } = await import("../features/Summarizer");
                  const { NoteWriter } = await import("../notes/NoteWriter");
                  const summary = await Summarizer.summarizeItem(item.id);
                  await NoteWriter.saveResponseAsNote(
                    item.id,
                    "文献摘要 (AGY AI)",
                    summary,
                  );
                  pw.changeLine({ progress: 100, text: "摘要已保存到笔记！" });
                  pw.startCloseTimer(3000);
                } catch (e: any) {
                  pw.changeLine({
                    progress: 100,
                    text: `生成失败: ${e.message}`,
                  });
                  pw.startCloseTimer(5000);
                }
              }
            }
          },
        },
        {
          tag: "menuitem",
          label: "AGY: 自动标签",
          commandListener: async () => {
            const items =
              Zotero.getActiveZoteroPane()?.getSelectedItems() || [];
            for (const item of items) {
              if (item.isRegularItem()) {
                const pw = new ztoolkit.ProgressWindow(
                  addon.data.config.addonName,
                )
                  .createLine({
                    text: "正在分析并生成标签...",
                    type: "default",
                    progress: 50,
                  })
                  .show();
                try {
                  const { AutoTagger } = await import("../features/AutoTagger");
                  const tags = await AutoTagger.suggestTags(item.id);
                  await AutoTagger.applyTags(item.id, tags);
                  pw.changeLine({
                    progress: 100,
                    text: `已添加 ${tags.length} 个标签！`,
                  });
                  pw.startCloseTimer(3000);
                } catch (e: any) {
                  pw.changeLine({
                    progress: 100,
                    text: `标签生成失败: ${e.message}`,
                  });
                  pw.startCloseTimer(5000);
                }
              }
            }
          },
        },
        {
          tag: "menuitem",
          label: "AGY: 翻译",
          commandListener: async () => {
            const items =
              Zotero.getActiveZoteroPane()?.getSelectedItems() || [];
            for (const item of items) {
              const text = item.isRegularItem()
                ? (item.getField("abstractNote") as string)
                : item.annotationText || "";
              if (text) {
                const pw = new ztoolkit.ProgressWindow(
                  addon.data.config.addonName,
                )
                  .createLine({
                    text: "正在翻译...",
                    type: "default",
                    progress: 50,
                  })
                  .show();
                try {
                  const { Translator } = await import("../features/Translator");
                  const { NoteWriter } = await import("../notes/NoteWriter");
                  const translated = await Translator.translate(text);
                  if (item.isRegularItem()) {
                    await NoteWriter.saveResponseAsNote(
                      item.id,
                      "中文翻译 (AGY AI)",
                      translated,
                    );
                  }
                  pw.changeLine({ progress: 100, text: "翻译完成！" });
                  pw.startCloseTimer(3000);
                } catch (e: any) {
                  pw.changeLine({
                    progress: 100,
                    text: `翻译失败: ${e.message}`,
                  });
                  pw.startCloseTimer(5000);
                }
              }
            }
          },
        },
      ],
    });
  }
}
