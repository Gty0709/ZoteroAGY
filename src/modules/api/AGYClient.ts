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

export interface ModelOption {
  id: string;
  name: string;
  efforts: string[];
  defaultEffort: string;
}

export interface EffortOption {
  id: string;
  name: string;
  description: string;
}

export class AGYClient {
  public static readonly AVAILABLE_MODELS: ModelOption[] = [
    {
      id: "gemini-3.8-flash",
      name: "Gemini 3.8 Flash",
      efforts: ["high", "medium", "low"],
      defaultEffort: "high",
    },
    {
      id: "gemini-3.7-flash",
      name: "Gemini 3.7 Flash",
      efforts: ["high", "medium", "low"],
      defaultEffort: "high",
    },
    {
      id: "gemini-3.6-flash",
      name: "Gemini 3.6 Flash",
      efforts: ["high", "medium", "low"],
      defaultEffort: "high",
    },
    {
      id: "gemini-3.1-pro",
      name: "Gemini 3.1 Pro",
      efforts: ["high", "low"],
      defaultEffort: "high",
    },
    {
      id: "claude-sonnet-4-6",
      name: "Claude Sonnet 4.6",
      efforts: [],
      defaultEffort: "",
    },
    {
      id: "claude-opus-4-6-thinking",
      name: "Claude Opus 4.6",
      efforts: [],
      defaultEffort: "",
    },
    {
      id: "gpt-oss-120b",
      name: "GPT-OSS 120B",
      efforts: ["medium"],
      defaultEffort: "medium",
    },
  ];

  public static readonly AVAILABLE_EFFORTS: EffortOption[] = [
    { id: "high", name: "高思考 (High)", description: "深度推理" },
    { id: "medium", name: "中思考 (Medium)", description: "平衡" },
    { id: "low", name: "低思考 (Low)", description: "极速响应" },
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
        home ? `${home}\\AppData\\Local\\Programs\\antigravity\\agy.exe` : "",
        home ? `${home}\\.gemini\\antigravity\\bin\\agy.exe` : "",
        home ? `${home}\\.gemini\\antigravity\\agy.exe` : "",
        home ? `${home}\\.cargo\\bin\\agy.exe` : "",
        home ? `${home}\\scoop\\shims\\agy.exe` : "",
        "C:\\Users\\Administrator\\AppData\\Local\\agy\\bin\\agy.exe",
        "C:\\Program Files\\antigravity\\agy.exe",
        "C:\\Program Files\\agy\\agy.exe",
      ].filter(Boolean);
      for (const cand of candidates) {
        if (AGYClient.checkFileExists(cand)) return cand;
      }

      // Windows where.exe fallback (in case desktop launcher stripped PATH)
      try {
        const Subprocess = getSubprocess();
        const proc = await Subprocess.call({
          command: "C:\\Windows\\System32\\where.exe",
          arguments: ["agy"],
          stdout: "pipe",
          stderr: "ignore",
        });
        const out = (await proc.stdout.readString())
          ?.trim()
          ?.split(/[\r\n]+/)?.[0];
        await proc.wait();
        if (out && AGYClient.checkFileExists(out)) {
          return out;
        }
      } catch (_) {}
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
    const effort = AGYClient.getEffort();

    const args: string[] = [];
    if (conversationId) {
      args.push("--conversation", conversationId);
    }
    args.push("--model", model);

    const modelDef = AGYClient.AVAILABLE_MODELS.find((m) => m.id === model);
    if (modelDef && modelDef.efforts.length > 0) {
      const activeEffort = modelDef.efforts.includes(effort)
        ? effort
        : modelDef.defaultEffort;
      if (activeEffort) {
        args.push("--effort", activeEffort);
      }
    }

    args.push(
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
      workdir: AGYClient.getHomeDir() || null,
    };

    try {
      const homeDir = AGYClient.getHomeDir();
      if (homeDir) {
        procOptions.environmentAppend = true;
        procOptions.environment = {
          HOME: homeDir,
          ...(Zotero.isWin ? { USERPROFILE: homeDir } : {}),
        };
      }
    } catch (_) {}

    const proc = await Subprocess.call(procOptions);

    // Concurrently consume stderr to prevent OS pipe buffer deadlocks
    let stderr = "";
    const stderrPromise = (async () => {
      try {
        while (true) {
          const errChunk: string = await proc.stderr.readString();
          if (!errChunk) break;
          stderr += errChunk;
        }
      } catch (_) {}
    })();

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
            if (data.result?.status === "ERROR") {
              const errMsg = data.result?.error || "AI 模型响应错误";
              throw new Error(errMsg);
            }
            if (data.result?.response) {
              if (
                !fullResponse ||
                data.result.response.length >= fullResponse.length
              ) {
                fullResponse = data.result.response;
                onChunk(fullResponse, false);
              }
            }
          }
        } catch (e: any) {
          if (e?.message && e.message.startsWith("error:")) {
            throw e;
          }
        }
      }
    }

    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer.trim());
        if (data.event === "step_update" && data.step_update?.text_delta) {
          fullResponse += data.step_update.text_delta;
          onChunk(data.step_update.text_delta, false);
        } else if (data.event === "result") {
          if (data.result?.status === "ERROR") {
            throw new Error(data.result?.error || "AI 模型响应错误");
          }
          if (data.result?.response) {
            if (
              !fullResponse ||
              data.result.response.length >= fullResponse.length
            ) {
              fullResponse = data.result.response;
              onChunk(fullResponse, false);
            }
          }
        }
      } catch (err: any) {
        if (err?.message && err.message.startsWith("error:")) {
          throw err;
        }
      }
    }

    const { exitCode } = await proc.wait();
    await stderrPromise;

    if (exitCode !== 0 && !fullResponse) {
      throw new Error(
        `Antigravity CLI 执行失败 (exit ${exitCode}): ${stderr.trim() || "未收到有效输出"}`,
      );
    }

    if (!fullResponse) {
      if (stderr.trim()) {
        throw new Error(`Antigravity CLI 返回错误: ${stderr.trim()}`);
      } else {
        throw new Error("Antigravity CLI 未返回回答内容，请检查连接或重试。");
      }
    }

    onChunk("", true);
    return {
      response: fullResponse,
      agyConversationId: capturedAgyConvId || undefined,
    };
  }

  static getModel(): string {
    const raw = (
      Zotero.Prefs.get(`${addon.data.config.prefsPrefix}.model`, true) as string
    )?.trim();
    if (!raw) return "gemini-3.8-flash";

    // Backward compatibility with legacy composite strings
    if (raw.startsWith("gemini-3.8-flash")) return "gemini-3.8-flash";
    if (raw.startsWith("gemini-3.7-flash")) return "gemini-3.7-flash";
    if (raw.startsWith("gemini-3.6-flash")) return "gemini-3.6-flash";
    if (raw.startsWith("gemini-3.1-pro")) return "gemini-3.1-pro";
    if (raw === "claude-sonnet-4-6") return "claude-sonnet-4-6";
    if (raw.startsWith("claude-opus-4-6")) return "claude-opus-4-6-thinking";
    if (raw.startsWith("gpt-oss-120b")) return "gpt-oss-120b";

    const found = AGYClient.AVAILABLE_MODELS.find((m) => m.id === raw);
    return found ? found.id : "gemini-3.8-flash";
  }

  static setModel(model: string): void {
    Zotero.Prefs.set(`${addon.data.config.prefsPrefix}.model`, model, true);
  }

  static getEffort(): string {
    const raw = (
      Zotero.Prefs.get(
        `${addon.data.config.prefsPrefix}.effort`,
        true,
      ) as string
    )?.trim();
    if (raw && ["high", "medium", "low"].includes(raw)) {
      return raw;
    }
    // Check if legacy model had suffix
    const legacyModel = (
      Zotero.Prefs.get(`${addon.data.config.prefsPrefix}.model`, true) as string
    )?.trim();
    if (legacyModel?.endsWith("-low")) return "low";
    if (legacyModel?.endsWith("-medium")) return "medium";
    if (legacyModel?.endsWith("-high")) return "high";

    return "high";
  }

  static setEffort(effort: string): void {
    Zotero.Prefs.set(`${addon.data.config.prefsPrefix}.effort`, effort, true);
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
