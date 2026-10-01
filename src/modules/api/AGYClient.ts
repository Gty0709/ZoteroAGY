let SubprocessModule: any = null;

function getSubprocess(): any {
  if (SubprocessModule) return SubprocessModule;
  try {
    // @ts-ignore
    SubprocessModule = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs").Subprocess;
    return SubprocessModule;
  } catch (e) {
    try {
      const scope: any = {};
      // @ts-ignore
      Components.utils.import("resource://gre/modules/Subprocess.jsm", scope);
      SubprocessModule = scope.Subprocess;
      return SubprocessModule;
    } catch (e2) {
      throw new Error("未能加载 Zotero Subprocess 模块: " + (e as any)?.message);
    }
  }
}

export class AGYClient {
  public static readonly AVAILABLE_MODELS = [
    { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)' },
    { id: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low)' },
    { id: 'gemini-3.1-pro-high', label: 'Gemini 3.1 Pro (High)' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Thinking)' },
    { id: 'claude-opus-4-6-thinking', label: 'Claude Opus 4.6 (Thinking)' },
    { id: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)' },
  ];

  static async findAgyPath(): Promise<string | null> {
    // 1. Check user preference override
    const customPath = (Zotero.Prefs.get(`${addon.data.config.prefsPrefix}.cliPath`, true) as string)?.trim();
    if (customPath) {
      try {
        // @ts-ignore
        const file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
        file.initWithPath(customPath);
        if (file.exists() && file.isFile()) return customPath;
      } catch (_) {}
    }

    // 2. Search PATH
    try {
      const Subprocess = getSubprocess();
      const inPath = await Subprocess.pathSearch(Zotero.isWin ? "agy.exe" : "agy");
      if (inPath) return inPath;
    } catch (_) {}

    // 3. Check Windows standard install paths
    if (Zotero.isWin) {
      try {
        // @ts-ignore
        const home = Services.dirsvc.get("Home", Components.interfaces.nsIFile).path;
        const candidates = [
          home + "\\AppData\\Local\\agy\\bin\\agy.exe",
          home + "\\AppData\\Local\\Programs\\agy\\bin\\agy.exe",
          "C:\\Users\\Administrator\\AppData\\Local\\agy\\bin\\agy.exe",
        ];
        for (const cand of candidates) {
          try {
            // @ts-ignore
            const file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
            file.initWithPath(cand);
            if (file.exists() && file.isFile()) return cand;
          } catch (_) {}
        }
      } catch (_) {}
    }

    // 4. Check Unix standard install paths
    if (!Zotero.isWin) {
      try {
        // @ts-ignore
        const home = Services.dirsvc.get("Home", Components.interfaces.nsIFile).path;
        const candidates = [
          home + "/.local/bin/agy",
          "/usr/local/bin/agy",
          "/opt/homebrew/bin/agy",
        ];
        for (const cand of candidates) {
          try {
            // @ts-ignore
            const file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
            file.initWithPath(cand);
            if (file.exists() && file.isFile()) return cand;
          } catch (_) {}
        }
      } catch (_) {}
    }

    return null;
  }

  static async checkCLIStatus(): Promise<{ available: boolean; path: string | null; error?: string }> {
    try {
      const agyPath = await AGYClient.findAgyPath();
      if (!agyPath) {
        return { available: false, path: null, error: "未检测到 agy.exe，请确认安装或在设置中配置路径" };
      }
      return { available: true, path: agyPath };
    } catch (e: any) {
      return { available: false, path: null, error: e?.message || String(e) };
    }
  }

  static async sendMessageStream(
    prompt: string,
    onChunk: (text: string, done: boolean) => void,
    conversationId?: string
  ): Promise<{ response: string; agyConversationId?: string }> {
    const agyPath = await AGYClient.findAgyPath();
    if (!agyPath) {
      throw new Error("未检测到 Antigravity CLI (agy.exe)。请确认已安装并在首选项设置中指定正确路径。");
    }

    const Subprocess = getSubprocess();
    const model = AGYClient.getModel();

    const args: string[] = [];
    if (conversationId) {
      args.push("--conversation", conversationId);
    }
    args.push(
      "--model", model,
      "--output-format", "stream-json",
      "--dangerously-skip-permissions",
      "--disable-slash-commands"
    );

    const proc = await Subprocess.call({
      command: agyPath,
      arguments: args,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Write prompt into stdin and close write stream
    await proc.stdin.write(prompt);
    await proc.stdin.close();

    let fullResponse = "";
    let capturedAgyConvId: string | null = null;
    let buffer = "";

    while (true) {
      const chunk: string = await proc.stdout.readString();
      if (!chunk) break;
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const data = JSON.parse(trimmed);
          if (data.event === "init" && data.conversation_id) {
            capturedAgyConvId = data.conversation_id;
          } else if (data.event === "step_update") {
            const delta = data.step_update?.text_delta;
            if (delta) {
              fullResponse += delta;
              onChunk(delta, false);
            }
          } else if (data.event === "result") {
            if (data.result?.conversation_id) {
              capturedAgyConvId = data.result.conversation_id;
            }
            if (data.result?.response && !fullResponse) {
              fullResponse = data.result.response;
              onChunk(fullResponse, false);
            }
          }
        } catch (_) {}
      }
    }

    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer.trim());
        if (data.event === "step_update" && data.step_update?.text_delta) {
          fullResponse += data.step_update.text_delta;
          onChunk(data.step_update.text_delta, false);
        } else if (data.event === "result" && data.result?.response && !fullResponse) {
          fullResponse = data.result.response;
          onChunk(fullResponse, false);
        }
      } catch (_) {}
    }

    const { exitCode } = await proc.wait();
    if (exitCode !== 0 && !fullResponse) {
      let stderr = "";
      try { stderr = await proc.stderr.readString(); } catch (_) {}
      throw new Error(`Antigravity CLI 执行失败 (exit ${exitCode}): ${stderr || '未收到有效输出'}`);
    }

    onChunk("", true);
    return { response: fullResponse, agyConversationId: capturedAgyConvId || undefined };
  }

  static getModel(): string {
    return (Zotero.Prefs.get(`${addon.data.config.prefsPrefix}.model`, true) as string) || 'gemini-3.8-flash-high';
  }

  static setModel(model: string): void {
    Zotero.Prefs.set(`${addon.data.config.prefsPrefix}.model`, model, true);
  }

  static async sendMessage(input: string | Array<{ role: string; content: string }>): Promise<string> {
    const prompt = typeof input === 'string' ? input : input[input.length - 1]?.content || '';
    let full = '';
    const res = await AGYClient.sendMessageStream(prompt, (chunk) => {
      full += chunk;
    });
    return res.response || full;
  }
}
