let SubprocessModule: any = null;

function getSubprocess(): any {
  if (SubprocessModule) return SubprocessModule;
  try {
    // @ts-ignore
    SubprocessModule = ChromeUtils.importESModule(
      "resource://gre/modules/Subprocess.sys.mjs",
    ).Subprocess;
    return SubprocessModule;
  } catch (e) {
    try {
      const scope: any = {};
      // @ts-ignore
      Components.utils.import("resource://gre/modules/Subprocess.jsm", scope);
      SubprocessModule = scope.Subprocess;
      return SubprocessModule;
    } catch (e2) {
      throw new Error(
        "未能加载 Zotero Subprocess 模块: " + (e as any)?.message,
      );
    }
  }
}

export class AGYClient {
  public static readonly AVAILABLE_MODELS = [
    { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)" },
    { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)" },
    { id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro (High)" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)" },
    { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 (Thinking)" },
    { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)" },
  ];

  static getBinName(): string {
    return Zotero.isWin ? "agy.exe" : "agy";
  }

  static getHomeDir(): string {
    try {
      // @ts-ignore
      return Services.dirsvc.get("Home", Components.interfaces.nsIFile).path;
    } catch (_) {
      try {
        return Services.env.get(Zotero.isWin ? "USERPROFILE" : "HOME") || "";
      } catch (_) {
        return "";
      }
    }
  }

  static checkFileExists(filePath: string): boolean {
    if (!filePath) return false;
    try {
      // @ts-ignore
      const file = Components.classes[
        "@mozilla.org/file/local;1"
      ].createInstance(Components.interfaces.nsIFile);
      file.initWithPath(filePath);
      return file.exists() && file.isFile();
    } catch (_) {
      return false;
    }
  }

  static async detectSystemAgyPath(): Promise<string | null> {
    const binName = AGYClient.getBinName();

    // 1. Search PATH via Subprocess
    try {
      const Subprocess = getSubprocess();
      const inPath = await Subprocess.pathSearch(binName);
      if (inPath && AGYClient.checkFileExists(inPath)) return inPath;
    } catch (_) {}

    const home = AGYClient.getHomeDir();

    // 2. Check Windows standard install paths
    if (Zotero.isWin) {
      const candidates = [
        home ? `${home}\\AppData\\Local\\agy\\bin\\agy.exe` : "",
        home ? `${home}\\AppData\\Local\\Programs\\agy\\bin\\agy.exe` : "",
        "C:\\Users\\Administrator\\AppData\\Local\\agy\\bin\\agy.exe",
      ].filter(Boolean);
      for (const cand of candidates) {
        if (AGYClient.checkFileExists(cand)) return cand;
      }
    }

    // 3. Check Linux and Unix standard install paths
    if (!Zotero.isWin) {
      const candidates = [
        home ? `${home}/.local/bin/agy` : "",
        home ? `${home}/.gemini/antigravity/bin/agy` : "",
        home ? `${home}/.config/Antigravity/bin/agy` : "",
        home ? `${home}/.cargo/bin/agy` : "",
        home ? `${home}/.bun/bin/agy` : "",
        home ? `${home}/bin/agy` : "",
        "/usr/local/bin/agy",
        "/usr/bin/agy",
        "/bin/agy",
        "/opt/agy/bin/agy",
        "/opt/homebrew/bin/agy",
        "/snap/bin/agy",
        "/var/lib/flatpak/exports/bin/agy",
        home ? `${home}/.local/share/flatpak/exports/bin/agy` : "",
      ].filter(Boolean);
      for (const cand of candidates) {
        if (AGYClient.checkFileExists(cand)) return cand;
      }

      // 4. Linux shell fallback (in case desktop launcher stripped PATH)
      try {
        const Subprocess = getSubprocess();
        const proc = await Subprocess.call({
          command: "/bin/sh",
          arguments: ["-c", "which agy"],
          stdout: "pipe",
          stderr: "ignore",
        });
        const out = (await proc.stdout.readString())?.trim();
        await proc.wait();
        if (out && AGYClient.checkFileExists(out)) {
          return out;
        }
      } catch (_) {}
    }

    return null;
  }

  static async findAgyPath(): Promise<string | null> {
    // 1. Check user preference override
    const customPath = (
      Zotero.Prefs.get(
        `${addon.data.config.prefsPrefix}.cliPath`,
        true,
      ) as string
    )?.trim();
    if (customPath && AGYClient.checkFileExists(customPath)) {
      return customPath;
    }

    // 2. Detect from system paths
    return await AGYClient.detectSystemAgyPath();
  }

  static async checkCLIStatus(specifiedPath?: string): Promise<{
    available: boolean;
    path: string | null;
    version?: string;
    error?: string;
  }> {
    try {
      const agyPath = specifiedPath || (await AGYClient.findAgyPath());
      const binName = AGYClient.getBinName();
      if (!agyPath || !AGYClient.checkFileExists(agyPath)) {
        return {
          available: false,
          path: null,
          error: `未检测到 Antigravity CLI (${binName})，请确认安装或在设置中指定路径`,
        };
      }

      // Test execution and retrieve version
      try {
        const Subprocess = getSubprocess();
        const proc = await Subprocess.call({
          command: agyPath,
          arguments: ["--version"],
          stdout: "pipe",
          stderr: "pipe",
        });
        const out = (await proc.stdout.readString())?.trim();
        await proc.wait();
        return {
          available: true,
          path: agyPath,
          version: out || undefined,
        };
      } catch (runErr: any) {
        return {
          available: true,
          path: agyPath,
          error: runErr?.message,
        };
      }
    } catch (e: any) {
      return { available: false, path: null, error: e?.message || String(e) };
    }
  }

  static async sendMessageStream(
    prompt: string,
    onChunk: (text: string, done: boolean) => void,
    conversationId?: string,
  ): Promise<{ response: string; agyConversationId?: string }> {
    const agyPath = await AGYClient.findAgyPath();
    const binName = AGYClient.getBinName();
    if (!agyPath) {
      throw new Error(
        `未检测到 Antigravity CLI (${binName})。请确认已安装并在首选项设置中指定正确路径。`,
      );
    }

    const Subprocess = getSubprocess();
    const model = AGYClient.getModel();

    const args: string[] = [];
    if (conversationId) {
      args.push("--conversation", conversationId);
    }
    args.push(
      "--model",
      model,
      "--output-format",
      "stream-json",
      "--dangerously-skip-permissions",
      "--disable-slash-commands",
    );

    const procOptions: any = {
      command: agyPath,
      arguments: args,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    };

    if (!Zotero.isWin) {
      try {
        const homeDir = AGYClient.getHomeDir();
        if (homeDir) {
          procOptions.environmentAppend = true;
          procOptions.environment = {
            HOME: homeDir,
          };
        }
      } catch (_) {}
    }

    const proc = await Subprocess.call(procOptions);

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
        } else if (
          data.event === "result" &&
          data.result?.response &&
          !fullResponse
        ) {
          fullResponse = data.result.response;
          onChunk(fullResponse, false);
        }
      } catch (_) {}
    }

    const { exitCode } = await proc.wait();
    if (exitCode !== 0 && !fullResponse) {
      let stderr = "";
      try {
        stderr = await proc.stderr.readString();
      } catch (_) {}
      throw new Error(
        `Antigravity CLI 执行失败 (exit ${exitCode}): ${stderr || "未收到有效输出"}`,
      );
    }

    onChunk("", true);
    return {
      response: fullResponse,
      agyConversationId: capturedAgyConvId || undefined,
    };
  }

  static getModel(): string {
    return (
      (Zotero.Prefs.get(
        `${addon.data.config.prefsPrefix}.model`,
        true,
      ) as string) || "gemini-3.8-flash-high"
    );
  }

  static setModel(model: string): void {
    Zotero.Prefs.set(`${addon.data.config.prefsPrefix}.model`, model, true);
  }

  static async sendMessage(
    input: string | Array<{ role: string; content: string }>,
  ): Promise<string> {
    const prompt =
      typeof input === "string"
        ? input
        : input[input.length - 1]?.content || "";
    let full = "";
    const res = await AGYClient.sendMessageStream(prompt, (chunk) => {
      full += chunk;
    });
    return res.response || full;
  }
}
