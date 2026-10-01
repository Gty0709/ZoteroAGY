import { AGYClient } from '../api/AGYClient';

export class AutoTagger {
  static async suggestTags(itemId: number): Promise<string[]> {
    const item = await Zotero.Items.getAsync(itemId) as Zotero.Item;
    if (!item) return [];
    const title = item.getField('title') as string;
    const abstract = item.getField('abstractNote') as string;
    const prompt = AutoTagger.getTaggingPrompt(title, abstract);
    const response = await AGYClient.sendMessage([{ role: 'user', content: prompt }]);
    return response.split(',').map(t => t.trim()).filter(t => t.length > 0 && t.length < 50);
  }

  static async applyTags(itemId: number, tags: string[]): Promise<void> {
    const item = await Zotero.Items.getAsync(itemId) as Zotero.Item;
    if (!item) return;
    for (const tag of tags) {
      item.addTag(tag, 0);
    }
    await item.saveTx();
  }

  private static getTaggingPrompt(title: string, abstract: string): string {
    return `Based on this academic paper, suggest 5-8 relevant tags/keywords.

Title: ${title}
Abstract: ${abstract || '(no abstract)'}

Return ONLY a comma-separated list of tags. Include:
- Research field/domain tags
- Methodology tags
- Key concept tags

Example format: machine learning, natural language processing, transformer, attention mechanism, text classification`;
  }
}
