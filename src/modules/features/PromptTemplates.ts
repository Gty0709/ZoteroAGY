export interface PromptTemplate {
  id: string;
  name: string;
  nameZh: string;
  prompt: string;
  category: "analysis" | "writing" | "translation" | "other";
  icon: string;
}

export class PromptTemplates {
  static getBuiltinTemplates(): PromptTemplate[] {
    return [
      {
        id: "summary",
        name: "Paper Summary",
        nameZh: "论文摘要",
        icon: "📄",
        category: "analysis",
        prompt:
          "请对以下论文/文本进行结构化摘要，包括：研究背景、目标、方法、主要发现、结论和局限性。\n\n{{context}}",
      },
      {
        id: "keypoints",
        name: "Key Points",
        nameZh: "要点提取",
        icon: "🔑",
        category: "analysis",
        prompt: "请提取以下内容的关键要点，以编号列表形式输出：\n\n{{context}}",
      },
      {
        id: "methods",
        name: "Methods Analysis",
        nameZh: "方法论分析",
        icon: "🔬",
        category: "analysis",
        prompt:
          "请详细分析以下研究的方法论，包括：研究设计、数据收集、分析方法、有效性和可重复性。\n\n{{context}}",
      },
      {
        id: "compare",
        name: "Literature Comparison",
        nameZh: "文献对比",
        icon: "⚖️",
        category: "analysis",
        prompt:
          "请对比分析以下内容与相关研究的异同，包括方法差异、结论差异和创新点。\n\n{{context}}",
      },
      {
        id: "questions",
        name: "Research Questions",
        nameZh: "研究问题",
        icon: "❓",
        category: "analysis",
        prompt: "基于以下内容，生成5个有深度的后续研究问题：\n\n{{context}}",
      },
      {
        id: "translate",
        name: "Translation",
        nameZh: "翻译",
        icon: "🌐",
        category: "translation",
        prompt: "请将以下学术文本翻译为中文，保持术语准确性：\n\n{{context}}",
      },
      {
        id: "eli5",
        name: "Explain Simply",
        nameZh: "通俗解释",
        icon: "💡",
        category: "other",
        prompt:
          "请用通俗易懂的语言解释以下学术内容，让非专业人士也能理解：\n\n{{context}}",
      },
      {
        id: "critique",
        name: "Critical Analysis",
        nameZh: "批判分析",
        icon: "🔍",
        category: "analysis",
        prompt:
          "请对以下研究进行批判性分析，指出优点、不足和改进建议：\n\n{{context}}",
      },
    ];
  }

  static getCustomTemplates(): PromptTemplate[] {
    try {
      const raw = Zotero.Prefs.get(
        `${addon.data.config.prefsPrefix}.customTemplates`,
        true,
      ) as string;
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  static saveCustomTemplate(template: PromptTemplate): void {
    const templates = PromptTemplates.getCustomTemplates();
    const idx = templates.findIndex((t) => t.id === template.id);
    if (idx >= 0) templates[idx] = template;
    else templates.push(template);
    Zotero.Prefs.set(
      `${addon.data.config.prefsPrefix}.customTemplates`,
      JSON.stringify(templates),
      true,
    );
  }

  static deleteCustomTemplate(id: string): void {
    const templates = PromptTemplates.getCustomTemplates().filter(
      (t) => t.id !== id,
    );
    Zotero.Prefs.set(
      `${addon.data.config.prefsPrefix}.customTemplates`,
      JSON.stringify(templates),
      true,
    );
  }

  static applyTemplate(
    templateId: string,
    variables: Record<string, string>,
  ): string {
    const all = [
      ...PromptTemplates.getBuiltinTemplates(),
      ...PromptTemplates.getCustomTemplates(),
    ];
    const template = all.find((t) => t.id === templateId);
    if (!template) return "";
    let result = template.prompt;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
    return result;
  }
}
