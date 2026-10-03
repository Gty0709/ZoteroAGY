import { AGYClient } from "../api/AGYClient";

export class Summarizer {
  static async summarizeItem(itemId: number): Promise<string> {
    const item = (await Zotero.Items.getAsync(itemId)) as Zotero.Item;
    if (!item) throw new Error("Item not found");
    const title = item.getField("title") as string;
    const abstract = item.getField("abstractNote") as string;
    const prompt = Summarizer.getSummaryPrompt(title, abstract, item.key);
    return await AGYClient.sendMessage([{ role: "user", content: prompt }]);
  }

  static async summarizeText(text: string): Promise<string> {
    const prompt = `请对以下学术文本进行全面、结构化摘要。必须绝对忠于原文，严禁主观臆造。包含：核心要点、主要论点、方法论（如适用）、结论与局限性。\n\n文本:\n${text}`;
    return await AGYClient.sendMessage([{ role: "user", content: prompt }]);
  }

  private static getSummaryPrompt(
    title: string,
    abstract: string,
    itemKey?: string,
  ): string {
    return `请对以下学术论文进行结构化深入分析。必须绝对忠于文献原文，严禁学术虚构。如需了解详细实验设计与实现细节，请主动调用 Zotero MCP 工具 (Windows 下调用 get_content(itemKey="${itemKey || ""}")，Linux 下调用 zotero_item_fulltext(item_key="${itemKey || ""}")) 调取正文全文并阅读笔记。

论文标题: ${title}
Zotero ItemKey: ${itemKey || ""}
摘要: ${abstract || "(无摘要)"}

请按以下结构输出：
1. **研究背景**: 简述研究领域和核心痛点
2. **研究目标**: 论文要解决的关键科学问题
3. **核心方法**: 论文提出的核心架构与关键算法（忠实于论文与代码实现）
4. **主要发现与实验结果**: 关键量化数据指标或理论突破
5. **结论**: 主要结论与学术价值
6. **局限性与未来工作**: 原文指出的局限性与潜在延伸

请用严谨学术中文回答，使用规范 Markdown 排版，必要时辅以 LaTeX 公式。`;
  }
}
