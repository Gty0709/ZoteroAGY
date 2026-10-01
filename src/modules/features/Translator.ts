import { AGYClient } from "../api/AGYClient";

export class Translator {
  static async translate(text: string, targetLang?: string): Promise<string> {
    const lang = targetLang || Translator.getTargetLanguage();
    const prompt = Translator.getTranslationPrompt(text, lang);
    return await AGYClient.sendMessage([{ role: "user", content: prompt }]);
  }

  private static getTranslationPrompt(
    text: string,
    targetLang: string,
  ): string {
    const langMap: Record<string, string> = {
      "zh-CN": "简体中文",
      "zh-TW": "繁体中文",
      en: "English",
      ja: "日本語",
      ko: "한국어",
      de: "Deutsch",
      fr: "Français",
    };
    const langName = langMap[targetLang] || targetLang;
    return `请将以下学术文本翻译为${langName}。保持学术术语的准确性，对于专业术语可在翻译后括号内标注原文。\n\n${text}`;
  }

  static getTargetLanguage(): string {
    return (
      (Zotero.Prefs.get(
        `${addon.data.config.prefsPrefix}.language`,
        true,
      ) as string) || "zh-CN"
    );
  }
}
