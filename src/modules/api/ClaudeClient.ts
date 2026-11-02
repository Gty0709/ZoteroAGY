import { EffortOption, ModelOption } from "./AGYClient";
import { QuotaManager } from "./QuotaManager";
import { debugLog } from "../../hooks";

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
      throw new Error("未能加载 Zotero Subprocess 模块: " + (e as any)?.message);
    }
  }
}

export class ClaudeClient {
  public static readonly AVAILABLE_MODELS: ModelOption[] = [
    {
      id: "sonnet",
      name: "Claude Sonnet 3.7",
      efforts: ["high", "medium", "low"],
      defaultEffort: "high",
    },
    {
      id: "opus",
      name: "Claude Opus 4.6",
      efforts: ["high", "medium", "low"],
      defaultEffort: "high",
    },
    {
      id: "haiku",
      name: "Claude Haiku 3.5",
      efforts: ["low"],
      defaultEffort: "low",
    },
    {
      id: "claude-sonnet-5-5",
      name: "Claude Sonnet 5.5",
      efforts: ["high", "medium", "low"],
      defaultEffort: "high",
    },
  ];

  public static readonly AVAILABLE_EFFORTS: EffortOption[] = [
    { id: "high", name: "高思考 (High)", description: "深度推理与严谨反思" },
    { id: "medium", name: "中思考 (Medium)", description: "平衡推理速度与质量" },
    { id: "low", name: "低思考 (Low)", description: "极速返回回答" },
  ];

  static getBinName(): string {
    return Zotero.isWin ? "claude.exe" : "claude";
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

  static async detectSystemClaudePath(): Promise<string | null> {
    const binName = ClaudeClient.getBinName();

    // 1. Search PATH via Subprocess
    try {
      const Subprocess = getSubprocess();
      const inPath = await Subprocess.pathSearch(binName);
      if (inPath && ClaudeClient.checkFileExists(inPath)) return inPath;
    } catch (_) {}

    const home = ClaudeClient.getHomeDir();

    // 2. Windows specific candidate paths
    if (Zotero.isWin) {
      const candidates = [
        home ? `${home}\\.local\\bin\\claude.exe` : "",
        home ? `${home}\\AppData\\Roaming\\npm\\claude.cmd` : "",
        home ? `${home}\\AppData\\Local\\Programs\\claude\\claude.exe` : "",
        home ? `${home}\\scoop\\shims\\claude.exe` : "",
        "C:\\Program Files\\claude\\claude.exe",
        "C:\\Users\\Administrator\\.local\\bin\\claude.exe",
      ].filter(Boolean);
      for (const cand of candidates) {
        if (ClaudeClient.checkFileExists(cand)) return cand;
      }

      // Windows where.exe fallback
      try {
        const Subprocess = getSubprocess();
        const proc = await Subprocess.call({
          command: "C:\\Windows\\System32\\where.exe",
          arguments: ["claude"],
          stdout: "pipe",
          stderr: "ignore",
        });
        const out = (await proc.stdout.readString())
          ?.trim()
          ?.split(/[\r\n]+/)?.[0];
        await proc.wait();
        if (out && ClaudeClient.checkFileExists(out)) {
          return out;
        }
      } catch (_) {}
    }

    // 3. Unix candidate paths
    if (!Zotero.isWin) {
      const candidates = [
        home ? `${home}/.local/bin/claude` : "",
        home ? `${home}/.cargo/bin/claude` : "",
        "/usr/local/bin/claude",
        "/usr/bin/claude",
        "/opt/homebrew/bin/claude",
      ].filter(Boolean);
      for (const cand of candidates) {
        if (ClaudeClient.checkFileExists(cand)) return cand;
      }
    }

    return null;
  }

  static getPrefPrefix(): string {
    return (
      (typeof addon !== "undefined" && addon?.data?.config?.prefsPrefix) ||
      "extensions.zoteroagy"
    );
  }

  static async findClaudePath(): Promise<string | null> {
    const customPath = (
      Zotero.Prefs.get(
        `${ClaudeClient.getPrefPrefix()}.claudePath`,
        true,
      ) as string
    )?.trim();
    if (customPath && ClaudeClient.checkFileExists(customPath)) {
      return customPath;
    }
    return await ClaudeClient.detectSystemClaudePath();
  }

  static async checkCLIStatus(): Promise<{
    available: boolean;
    path: string | null;
    version?: string;
    error?: string;
  }> {
    try {
      const claudePath = await ClaudeClient.findClaudePath();
      const binName = ClaudeClient.getBinName();
      if (!claudePath || !ClaudeClient.checkFileExists(claudePath)) {
        return {
          available: false,
          path: null,
          error: `未检测到 Claude Code CLI (${binName})，请确认安装或在设置中指定路径`,
        };
      }

      const Subprocess = getSubprocess();
      const proc = await Subprocess.call({
        command: claudePath,
        arguments: ["--version"],
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = (await proc.stdout.readString())?.trim();
      await proc.wait();
      return {
        available: true,
        path: claudePath,
        version: out || undefined,
      };
    } catch (e: any) {
      return { available: false, path: null, error: e?.message || String(e) };
    }
  }

  public static getModel(): string {
    const raw = (
      Zotero.Prefs.get(
        `${ClaudeClient.getPrefPrefix()}.claudeModel`,
        true,
      ) as string
    )?.trim();
    if (!raw) return "sonnet";
    const found = ClaudeClient.AVAILABLE_MODELS.find((m) => m.id === raw);
    return found ? found.id : "sonnet";
  }

  public static setModel(model: string): void {
    Zotero.Prefs.set(
      `${ClaudeClient.getPrefPrefix()}.claudeModel`,
      model,
      true,
    );
  }

  public static getEffort(): string {
    const raw = (
      Zotero.Prefs.get(
        `${ClaudeClient.getPrefPrefix()}.claudeEffort`,
        true,
      ) as string
    )?.trim();
    if (raw && ["high", "medium", "low"].includes(raw)) {
      return raw;
    }
    return "high";
  }

  public static setEffort(effort: string): void {
    Zotero.Prefs.set(
      `${ClaudeClient.getPrefPrefix()}.claudeEffort`,
      effort,
      true,
    );
  }

  /**
   * Fetch live usage text via claude -p "/usage"
   */
  public static async fetchLiveUsage(): Promise<string | null> {
    const claudePath = await ClaudeClient.findClaudePath();
    if (!claudePath) return null;

    try {
      const Subprocess = getSubprocess();
      const homeDir = ClaudeClient.getHomeDir();
      const procOptions: any = {
        command: claudePath,
        arguments: ["-p", "/usage", "--dangerously-skip-permissions"],
        stdin: "pipe",
        stdout: "pipe",
        stderr: "ignore",
        workdir: homeDir || null,
      };
      if (homeDir) {
        procOptions.environmentAppend = true;
        procOptions.environment = {
          HOME: homeDir,
          ...(Zotero.isWin ? { USERPROFILE: homeDir } : {}),
        };
      }
      const proc = await Subprocess.call(procOptions);
      // Immediately close stdin to avoid 3s wait
      await proc.stdin.close();
      const out = (await proc.stdout.readString())?.trim();
      await proc.wait();
      return out || null;
    } catch (e: any) {
      debugLog("fetchLiveUsage error: " + e.message);
      return null;
    }
  }

  /**
   * Stream message via Claude Code CLI.
   */
  public static async sendMessageStream(
    prompt: string,
    onChunk: (delta: string, done: boolean) => void,
    sessionId?: string,
  ): Promise<{
    response: string;
    claudeSessionId?: string;
    usage?: { inputTokens: number; outputTokens: number };
  }> {
    const claudePath = await ClaudeClient.findClaudePath();
    const binName = ClaudeClient.getBinName();
    if (!claudePath) {
      throw new Error(
        `未检测到 Claude Code CLI (${binName})。请确认已安装并在首选项设置中指定正确路径。`,
      );
    }

    const Subprocess = getSubprocess();
    const model = ClaudeClient.getModel();
    const effort = ClaudeClient.getEffort();

    const args: string[] = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
    ];

    if (sessionId) {
      args.push("--resume", sessionId);
    }
    if (model) {
      args.push("--model", model);
    }
    if (effort) {
      args.push("--effort", effort);
    }

    const homeDir = ClaudeClient.getHomeDir();
    const procOptions: any = {
      command: claudePath,
      arguments: args,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      workdir: homeDir || null,
    };

    if (homeDir) {
      procOptions.environmentAppend = true;
      procOptions.environment = {
        HOME: homeDir,
        ...(Zotero.isWin ? { USERPROFILE: homeDir } : {}),
      };
    }

    const proc = await Subprocess.call(procOptions);

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

    // Write full prompt into stdin immediately and close to prevent 3s hang
    await proc.stdin.write(prompt);
    await proc.stdin.close();

    let fullResponse = "";
    let capturedSessionId: string | null = null;
    let tokenUsage: { inputTokens: number; outputTokens: number } | undefined;
    let buffer = "";

    const processJsonLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("{")) return;
      try {
        const data = JSON.parse(trimmed);

        if (data.session_id) {
          capturedSessionId = data.session_id;
        }

        // 1. Rate limit event (5h & week metrics)
        if (data.type === "rate_limit_event" && data.rate_limit_info) {
          QuotaManager.updateFromRateLimit(data.rate_limit_info);
        }

        // 2. Assistant response block
        if (data.type === "assistant" && data.message?.content) {
          const contentItems = data.message.content;
          for (const item of contentItems) {
            if (item.type === "text" && item.text) {
              if (item.text.length > fullResponse.length) {
                const delta = item.text.slice(fullResponse.length);
                fullResponse = item.text;
                onChunk(delta, false);
              }
            }
          }
        }

        // 3. Streaming content delta
        if (data.type === "content_block_delta" && data.delta?.text) {
          fullResponse += data.delta.text;
          onChunk(data.delta.text, false);
        }

        // 4. Final result event
        if (data.type === "result") {
          if (data.is_error || data.result === "Not logged in · Please run /login") {
            throw new Error(data.result || "Claude Code 认证或运行时错误");
          }
          if (data.result && typeof data.result === "string") {
            if (data.result.length > fullResponse.length) {
              const delta = data.result.slice(fullResponse.length);
              fullResponse = data.result;
              onChunk(delta, false);
            }
          }
          if (data.usage) {
            tokenUsage = {
              inputTokens:
                (data.usage.input_tokens || 0) +
                (data.usage.cache_read_input_tokens || 0) +
                (data.usage.cache_creation_input_tokens || 0),
              outputTokens: data.usage.output_tokens || 0,
            };
          }
        }
      } catch (err: any) {
        if (err?.message && err.message.includes("Claude Code")) {
          throw err;
        }
      }
    };

    while (true) {
      const chunk: string = await proc.stdout.readString();
      if (!chunk) break;
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        processJsonLine(line);
      }
    }

    if (buffer.trim()) {
      processJsonLine(buffer.trim());
    }

    const { exitCode } = await proc.wait();
    await stderrPromise;

    if (exitCode !== 0 && !fullResponse) {
      throw new Error(
        `Claude Code 执行失败 (exit ${exitCode}): ${stderr.trim() || "未收到响应"}`,
      );
    }

    if (!fullResponse) {
      if (stderr.trim()) {
        throw new Error(`Claude Code 错误: ${stderr.trim()}`);
      } else {
        throw new Error("Claude Code 未返回内容，请检查连接状态。");
      }
    }

    onChunk("", true);
    return {
      response: fullResponse,
      claudeSessionId: capturedSessionId || undefined,
      usage: tokenUsage,
    };
  }
}
