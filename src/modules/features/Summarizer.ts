import { AGYClient } from '../api/AGYClient';

export class Summarizer {
  static async summarizeItem(itemId: number): Promise<string> {
    const item = await Zotero.Items.getAsync(itemId) as Zotero.Item;
    if (!item) throw new Error('Item not found');
    const title = item.getField('title') as string;
    const abstract = item.getField('abstractNote') as string;
    const prompt = Summarizer.getSummaryPrompt(title, abstract);
    return await AGYClient.sendMessage([{ role: 'user', content: prompt }]);
  }

  static async summarizeText(text: string): Promise<string> {
    const prompt = `Please provide a comprehensive summary of the following text. Structure your summary with: Key Points, Main Arguments, Methodology (if applicable), and Conclusions.\n\nText:\n${text}`;
    return await AGYClient.sendMessage([{ role: 'user', content: prompt }]);
  }

  private static getSummaryPrompt(title: string, abstract: string): string {
    return `请对以下学术论文进行结构化摘要分析：

标题: ${title}
摘要: ${abstract || '(无摘要)'}

请按以下结构输出：
1. **研究背景**: 简述研究领域和问题
2. **研究目标**: 论文要解决的核心问题
3. **研究方法**: 使用的主要方法和技术
4. **主要发现**: 关键实验结果或理论贡献
5. **结论**: 主要结论和意义
6. **局限性**: 可能的局限和未来方向

请用中文回答，保持学术严谨性。`;
  }
}
