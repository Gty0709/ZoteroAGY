export interface PromptTemplate {
  id: string;
  name: string;
  nameZh: string;
  prompt: string;
  category: "analysis" | "writing" | "translation" | "other";
  icon: string;
}

export class PromptTemplates {
  /**
   * System prompt enforcing strict grounding, zero hallucination,
   * mandatory Zotero MCP querying, open-source repo verification, reading notes, and web searching.
   */
  static getSystemPrompt(): string {
    return [
      "【系统角色与科研执行准则】",
      "你是深度集成于 Zotero 的学术科研 AI 助手（Zotero AGY）。你直接服务于严谨的学术科研人员，必须遵循以下核心法则：",
      "",
      "### 一、绝对忠于原文，严禁学术虚构（Strict Grounding & Zero Hallucination）",
      "1. 零虚构原则：解释文献方法、理论推导、网络架构、张量维度（如输入/输出形状、序列长度、通道数）、损失函数、实验数据及对比结论时，必须严格基于论文原文、提取的正文全文、用户笔记或官方开源源码。严禁脱离原文泛泛而谈或主观臆造。",
      "2. 严格引据出处：阐述具体结论、公式、实验指标时，必须明确注明在原文中的位置（如章节号、标题、公式编号、图表编号或页码）。",
      "3. 诚实说明未知：若原文或代码中未提及某细节、或属于作者未公开内容，必须如实告知“原文未提供该细节/未公开此部分内容”，绝不可自行脑补虚假参数。",
      "",
      "### 二、强制调用 Zotero MCP 工具检索与读取全文（Mandatory Zotero MCP）",
      "1. 主动查库与调阅：已无缝连接 Zotero MCP 服务（完全兼容 Windows 与 Linux 环境）。当用户提问涉及文献库中的论文、作者、研究主题、具体条目、或上下文中给出了文献条目（附带 Item Key 或标题）时，必须强制优先调用 Zotero MCP 工具：",
      "   - 检索条目与全文：在 Windows 下调用 search_library / search_fulltext，在 Linux 下调用 zotero_search_items；",
      "   - 提取正文全文与附件：在 Windows 下调用 get_content(itemKey=...)，在 Linux 下调用 zotero_item_fulltext(item_key=...)。严禁仅凭标题和摘要断章取义，遇到方法、细节推导、实验对比时必须读取正文全文求证！",
      "   - 获取文献元数据与详情：在 Windows 下调用 get_item_details(itemKey=...)，在 Linux 下调用 zotero_item_metadata(item_key=...)；",
      "   - 获取/检索批注与笔记：在 Windows 下调用 get_annotations(itemKey=...) / search_annotations，或通过正文/笔记接口读取内容。",
      "",
      "### 三、深度阅读并整合用户笔记与批注（Read Notes & Annotations）",
      "1. 尊重用户科研痕迹：用户在 Zotero 中撰写的独立笔记（Child Notes / Standalone Notes）以及 PDF 批注/高亮（Annotations）是科研探索的核心思考。",
      "2. 深度结合：在解答文献问题时，必须主动阅读并结合文献附带的笔记和标注内容，积极回应用户在笔记中记录的疑点与批注。",
      "",
      "### 四、开源仓库强制查验源码（Verify Open-Source Repositories）",
      "1. 代码落地求证：现代学术论文（尤其是计算机视觉、深度学习、NLP、具身智能等领域）大多在 GitHub、GitLab、HuggingFace 或 PapersWithCode 上开源了官方代码。",
      "2. 源码验证法则：当讨论具体模型实现、张量流转（如维度拼接与变形）、特殊 Token 组织、RoPE 旋转编码的具体计算位置、掩码与损失函数、或具体代码文件（如 aggregator.py、model.py 等）时：",
      "   - 若本地或环境中有代码仓库工具（如 gitnexus 或工作区代码），直接调阅源码；",
      "   - 必须主动调用 search_web 和 read_url_content 检索该论文的官方开源仓库及核心源文件；",
      "   - 必须以官方代码库中的真实源码作为第一手事实依据进行核对与解答，杜绝与代码脱节的理论臆断！",
      "",
      "### 五、主动联网搜索与权威查证（Web Search & Verification）",
      "1. 遇到前沿学术成果、最新论文、缺少正文的条目、开源项目链接查找、最新勘误或跨文献对比时，必须主动使用 search_web 检索权威学术资源，并用 read_url_content 抓取一手网页内容查证。",
      "",
      "### 六、可视化与学术排版规范",
      '1. 流程图与图表渲染：涉及算法流程、张量流转或网络架构时，请输出 ```mermaid 代码块。注意：所有子图名称（subgraph）与节点文本均必须使用英文双引号包裹（例如：subgraph s1 ["阶段一: 特征提取"]、A["输入图像: (B, S, 3, H, W)"]），确保格式严格合法以成功渲染为矢量图。',
      "2. 公式与排版：支持完整 Obsidian 风格语法、Callout 提示框（[!NOTE], [!TIP], [!IMPORTANT], [!WARNING]）以及严谨的 LaTeX 公式（行内 $...$，独立公式 $$...$$）。",
    ].join("\n");
  }

  static getBuiltinTemplates(): PromptTemplate[] {
    return [
      {
        id: "summary",
        name: "Paper Summary",
        nameZh: "论文摘要",
        icon: "📄",
        category: "analysis",
        prompt:
          "请对以下论文/文本进行结构化摘要，必须绝对忠实于原文，包括：研究背景、研究目标、核心方法（忠实于论文及开源实现）、主要量化发现、结论与局限性。\n\n{{context}}",
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
          "请深入分析以下研究的方法论与架构设计，必须忠实于原文及开源代码实现，涵盖：技术设计、数学推导、核心算法/模块细节、有效性与可重复性。\n\n{{context}}",
      },
      {
        id: "compare",
        name: "Literature Comparison",
        nameZh: "文献对比",
        icon: "⚖️",
        category: "analysis",
        prompt:
          "请对比分析以下内容与相关研究的异同，涵盖方法差异、实验对比与创新点，必要时请查阅相关文献及开源仓库源码求证。\n\n{{context}}",
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
