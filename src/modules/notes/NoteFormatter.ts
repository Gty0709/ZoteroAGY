import { marked } from "marked";
import katex from "katex";
import { ContextItem } from "../../addon";
import { debugLog } from "../../hooks";

// Configure marked options
marked.setOptions({
  gfm: true,
  breaks: true,
});

export class NoteFormatter {
  /**
   * Convert markdown string into Obsidian-like formatted HTML.
   * Supports:
   * - Mermaid diagrams (```mermaid ... ```)
   * - KaTeX LaTeX Math ($...$ and $$...$$)
   * - Obsidian Callouts (> [!NOTE], > [!TIP], > [!WARNING], etc.)
   * - Code blocks with language tag and copy button
   * - Tables, Task lists, blockquotes, headers
   */
  static markdownToHTML(md: string): string {
    if (!md) return "";

    try {
      // 1. Preprocess Math formulas to protect them from markdown parsing
      const mathPlaceholders: { id: string; html: string }[] = [];
      let mathCounter = 0;

      // Extract display math ($$...$$)
      let processed = md.replace(/\$\$([\s\S]+?)\$\$/g, (_match, expr) => {
        const id = `___KATEX_BLOCK_${mathCounter++}___`;
        try {
          const rendered = katex.renderToString(expr.trim(), {
            displayMode: true,
            throwOnError: false,
          });
          mathPlaceholders.push({
            id,
            html: `<div class="agy-math-block">${rendered}</div>`,
          });
        } catch {
          mathPlaceholders.push({
            id,
            html: `<pre class="agy-math-err">${expr}</pre>`,
          });
        }
        return id;
      });

      // Extract inline math ($...$) - ensure no spaces right after or before $
      processed = processed.replace(
        /(?<!\$)\$(?!\$)([^$\n]+?)(?<!\$)\$(?!\$)/g,
        (_match, expr) => {
          const id = `___KATEX_INLINE_${mathCounter++}___`;
          try {
            const rendered = katex.renderToString(expr.trim(), {
              displayMode: false,
              throwOnError: false,
            });
            mathPlaceholders.push({
              id,
              html: `<span class="agy-math-inline">${rendered}</span>`,
            });
          } catch {
            mathPlaceholders.push({ id, html: `<code>${expr}</code>` });
          }
          return id;
        },
      );

      // 2. Preprocess Obsidian Callouts (> [!NOTE] Title...)
      processed = processed.replace(
        /^>\s*\[!(NOTE|TIP|INFO|IMPORTANT|WARNING|CAUTION|SUCCESS|QUESTION|EXAMPLE|QUOTE|BUG|FAILURE)\]([^\n]*)\n((?:>.*\n?)*)/gim,
        (_match, type, title, body) => {
          const tLower = type.toLowerCase();
          const cleanTitle = (title || type).trim();
          const cleanBody = body.replace(/^>\s?/gm, "");
          const icons: Record<string, string> = {
            note: "ℹ️",
            info: "ℹ️",
            tip: "💡",
            important: "🔔",
            warning: "⚠️",
            caution: "🛑",
            success: "✅",
            question: "❓",
            example: "📋",
            quote: "💬",
            bug: "🐛",
            failure: "❌",
          };
          const icon = icons[tLower] || "📝";
          return `<div class="agy-callout agy-callout-${tLower}"><div class="agy-callout-title"><span class="agy-callout-icon">${icon}</span><strong>${cleanTitle}</strong></div><div class="agy-callout-content">\n\n${cleanBody}\n\n</div></div>\n\n`;
        },
      );

      // 3. Parse Markdown via marked
      let html = marked.parse(processed) as string;

      // 4. Handle Mermaid diagrams specially before generic code blocks
      html = html.replace(
        /<pre><code class="(?:language-|lang-)?mermaid(?: [^"]*)?">([\s\S]*?)<\/code><\/pre>/gi,
        (_m, codeContent) => {
          // Decode HTML entities
          const rawCode = codeContent
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
          const encoded = encodeURIComponent(rawCode.trim());
          return `
          <div class="agy-mermaid-wrapper" data-mermaid-code="${encoded}">
            <div class="agy-mermaid-header">
              <span class="agy-mermaid-title">📊 Mermaid 流程图</span>
              <div class="agy-mermaid-btns">
                <button class="agy-mermaid-toggle-btn" title="查看/隐藏源码">源码</button>
                <button class="agy-mermaid-copy-btn" title="复制源码">📋 复制</button>
              </div>
            </div>
            <div class="agy-mermaid-output">
              <div class="agy-mermaid-loading">⏳ 正在渲染流程图...</div>
            </div>
            <div class="agy-mermaid-code-view" style="display: none;">
              <pre><code class="language-mermaid">${codeContent}</code></pre>
            </div>
          </div>
        `;
        },
      );

      // 5. Wrap generic Code Blocks with Obsidian-style header & copy button
      html = html.replace(
        /<pre><code class="language-([^"]*)">([\s\S]*?)<\/code><\/pre>/g,
        (_m, lang, codeContent) => {
          const displayLang = lang || "text";
          return `
          <div class="agy-code-wrapper">
            <div class="agy-code-header">
              <span class="agy-code-lang">${displayLang}</span>
              <button class="agy-code-copy-btn" title="复制代码">📋 复制</button>
            </div>
            <pre><code class="language-${lang}">${codeContent}</code></pre>
          </div>
        `;
        },
      );
      // Handle code blocks without language tag
      html = html.replace(
        /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
        (_m, codeContent) => {
          return `
          <div class="agy-code-wrapper">
            <div class="agy-code-header">
              <span class="agy-code-lang">code</span>
              <button class="agy-code-copy-btn" title="复制代码">📋 复制</button>
            </div>
            <pre><code>${codeContent}</code></pre>
          </div>
        `;
        },
      );

      // 6. Restore Math placeholders
      for (const item of mathPlaceholders) {
        html = html.replace(item.id, item.html);
      }

      return html;
    } catch {
      // Fallback in case of parsing error
      return md
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>");
    }
  }

  /**
   * Safely render markdown into a DOM container using tolerant HTML5 parsing and node adoption.
   * This completely avoids XML innerHTML parsing errors on .xhtml documents!
   */
  static renderToDOM(
    doc: Document,
    md: string,
    container: HTMLElement,
    skipMermaid: boolean = false,
  ): void {
    const html = NoteFormatter.markdownToHTML(md);
    try {
      const parser = new DOMParser();
      const htmlDoc = parser.parseFromString(
        `<body>${html}</body>`,
        "text/html",
      );

      // Clear container
      container.textContent = "";

      // Import nodes safely into container's document
      const bodyChildren = htmlDoc.body
        ? Array.from(htmlDoc.body.childNodes)
        : [];
      for (const child of bodyChildren) {
        if (child) {
          const imported = doc.importNode(child, true);
          container.appendChild(imported);
        }
      }

      // Attach copy button listeners to all standard code blocks
      const copyButtons = container.querySelectorAll(".agy-code-copy-btn");
      copyButtons.forEach((btn: Element) => {
        btn.addEventListener("click", async (e: Event) => {
          e.stopPropagation();
          const codeEl = btn
            .closest(".agy-code-wrapper")
            ?.querySelector("code");
          const codeText = codeEl?.textContent || "";
          try {
            // @ts-ignore
            await Zotero.Utilities?.Internal?.copyTextToClipboard?.(codeText);
            btn.textContent = "✅ 已复制";
            setTimeout(() => {
              btn.textContent = "📋 复制";
            }, 2000);
          } catch {}
        });
      });

      // Render all Mermaid diagram wrappers unless skipped during streaming
      if (!skipMermaid) {
        const mermaidWrappers = container.querySelectorAll(
          ".agy-mermaid-wrapper",
        );
        if (mermaidWrappers.length > 0) {
          NoteFormatter.renderAllMermaid(doc, mermaidWrappers);
        }
      }
    } catch {
      // Direct text fallback
      container.textContent = md;
    }
  }

  /**
   * Ensure browser environment globals (window, document, getComputedStyle, etc.)
   * are temporarily mounted on globalThis during mermaid operations in XPCOM scopes.
   */
  static async withDocumentGlobals<T>(
    doc: Document,
    action: () => Promise<T> | T,
  ): Promise<T> {
    const win =
      doc.defaultView ||
      (typeof globalThis !== "undefined" ? (globalThis as any).window : null);
    const globalObj = globalThis as any;
    const restores: Array<{
      target: any;
      key: string;
      prev: any;
      had: boolean;
    }> = [];

    function setGlobal(target: any, key: string, val: any) {
      if (val === undefined) return;
      restores.push({
        target,
        key,
        prev: target[key],
        had: key in target,
      });
      target[key] = val;
    }

    if (win) {
      setGlobal(globalObj, "window", win);
      setGlobal(globalObj, "document", doc);
      if (win.getComputedStyle)
        setGlobal(
          globalObj,
          "getComputedStyle",
          win.getComputedStyle.bind(win),
        );
      if (win.DOMParser) setGlobal(globalObj, "DOMParser", win.DOMParser);
      if (win.XMLSerializer)
        setGlobal(globalObj, "XMLSerializer", win.XMLSerializer);
      if (win.CSSStyleSheet)
        setGlobal(globalObj, "CSSStyleSheet", win.CSSStyleSheet);
      if (win.Element) setGlobal(globalObj, "Element", win.Element);
      if (win.HTMLElement) setGlobal(globalObj, "HTMLElement", win.HTMLElement);
      if (win.SVGElement) setGlobal(globalObj, "SVGElement", win.SVGElement);
      if (win.Node) setGlobal(globalObj, "Node", win.Node);
    }

    // Intercept document.body in case of XUL/XHTML documents where document.body is null
    let tempBodyCreated = false;
    let originalBodyDesc: PropertyDescriptor | undefined;
    if (!doc.body) {
      try {
        originalBodyDesc = Object.getOwnPropertyDescriptor(doc, "body");
        Object.defineProperty(doc, "body", {
          configurable: true,
          get: () =>
            doc.documentElement ||
            doc.getElementById("zoteroagy-standalone-root") ||
            doc,
        });
        tempBodyCreated = true;
      } catch (_) {}
    }

    try {
      return await action();
    } finally {
      if (tempBodyCreated) {
        try {
          if (originalBodyDesc) {
            Object.defineProperty(doc, "body", originalBodyDesc);
          } else {
            // @ts-ignore
            delete doc.body;
          }
        } catch (_) {}
      }
      for (let i = restores.length - 1; i >= 0; i--) {
        const r = restores[i];
        if (r.had) {
          r.target[r.key] = r.prev;
        } else {
          delete r.target[r.key];
        }
      }
    }
  }

  /**
   * Pre-normalize Mermaid flowchart syntax to avoid parse failures
   * e.g. unquoted subgraphs or labels containing parentheses, colons, slashes
   * Safely operates line-by-line and NEVER touches lines already containing double quotes.
   */
  static normalizeMermaidCode(code: string): string {
    const lines = code.replace(/\r\n/g, "\n").trim().split("\n");

    const normalizedLines = lines.map((line) => {
      // If the line already has double quotes, it already has quoted titles/labels - keep strictly as is!
      if (line.includes('"')) {
        return line;
      }

      let modified = line;

      // 1. Subgraph normalization:
      // Case A: subgraph sub1 [客户端 (Client)] -> subgraph sub1 ["客户端 (Client)"]
      // Case B: subgraph 客户端 (Client) -> subgraph "客户端 (Client)"
      modified = modified.replace(
        /^([ \t]*subgraph\s+)(?!["'])(.+?)$/,
        (match, prefix, rest) => {
          const trimmed = rest.trim();
          const bracketMatch = trimmed.match(/^([A-Za-z0-9_-]+)\s*\[(.*?)\]$/);
          if (bracketMatch) {
            const id = bracketMatch[1];
            const title = bracketMatch[2].trim().replace(/^["']|["']$/g, "");
            return `${prefix}${id} ["${title}"]`;
          }
          if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
            return match;
          }
          return `${prefix}"${trimmed}"`;
        },
      );

      // 2. Cylinder shape: F[(MySQL / PostgreSQL)] -> F[("MySQL / PostgreSQL")]
      modified = modified.replace(
        /(\b[A-Za-z0-9_-]+\s*)\[\(\s*(.*?)\s*\)\]/g,
        (_match, id, label) => {
          return `${id}[("${label.trim()}")]`;
        },
      );

      // 3. Rounded rectangle: A([Text (Paren)]) -> A(["Text (Paren)"])
      modified = modified.replace(
        /(\b[A-Za-z0-9_-]+\s*)\(\[\s*(.*?)\s*\]\)/g,
        (_match, id, label) => {
          return `${id}(["${label.trim()}"])`;
        },
      );

      // 4. Standard rectangle: A[用户请求 (Client)] -> A["用户请求 (Client)"]
      modified = modified.replace(
        /(\b[A-Za-z0-9_-]+\s*)\[(?!\[|\()([^\]\n]+)\]/g,
        (match, id, label) => {
          const trimmed = label.trim();
          if (!trimmed) return match;
          return `${id}["${trimmed}"]`;
        },
      );

      return modified;
    });

    return normalizedLines.join("\n");
  }

  /** Render all mermaid containers in document */
  static async renderAllMermaid(
    doc: Document,
    wrappers: NodeListOf<Element> | Element[],
  ): Promise<void> {
    const m = await NoteFormatter.ensureMermaid(doc);

    wrappers.forEach(async (wrapper: Element) => {
      const code = decodeURIComponent(
        wrapper.getAttribute("data-mermaid-code") || "",
      );
      const outputEl = wrapper.querySelector(".agy-mermaid-output");
      const toggleBtn = wrapper.querySelector(".agy-mermaid-toggle-btn");
      const copyBtn = wrapper.querySelector(".agy-mermaid-copy-btn");
      const codeView = wrapper.querySelector(
        ".agy-mermaid-code-view",
      ) as HTMLElement;

      // Setup toggle button
      if (toggleBtn && codeView) {
        toggleBtn.addEventListener("click", (e: Event) => {
          e.stopPropagation();
          const isHidden = codeView.style.display === "none";
          codeView.style.display = isHidden ? "block" : "none";
          toggleBtn.textContent = isHidden ? "收起" : "源码";
        });
      }

      // Setup copy button
      if (copyBtn) {
        copyBtn.addEventListener("click", async (e: Event) => {
          e.stopPropagation();
          try {
            // @ts-ignore
            await Zotero.Utilities?.Internal?.copyTextToClipboard?.(code);
            copyBtn.textContent = "✅ 已复制";
            setTimeout(() => {
              copyBtn.textContent = "📋 复制";
            }, 2000);
          } catch {}
        });
      }

      // Render diagram
      if (!outputEl) return;
      if (!code.trim()) {
        outputEl.innerHTML =
          '<div class="agy-mermaid-error">Mermaid 代码为空</div>';
        return;
      }

      if (!m) {
        outputEl.innerHTML =
          '<div class="agy-mermaid-error">⚠️ Mermaid 渲染器尚未就绪，已显示源码</div>';
        if (codeView) codeView.style.display = "block";
        return;
      }

      try {
        // Try original code first if parse is clean, otherwise try normalized code
        let codeToRender = code;
        let canParseOriginal = false;
        if (typeof m.parse === "function") {
          try {
            await NoteFormatter.withDocumentGlobals(doc, () =>
              m.parse(code, { suppressErrors: true }),
            );
            canParseOriginal = true;
          } catch (_) {
            canParseOriginal = false;
          }
        }

        if (!canParseOriginal) {
          codeToRender = NoteFormatter.normalizeMermaidCode(code);
        }

        const renderId = `agy_mm_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

        // Host element appended inside outputEl (safely in live document tree)
        const host = doc.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "div",
        ) as HTMLElement;
        host.style.cssText =
          "position: absolute; left: -9999px; top: 0; width: 800px; height: 1px; overflow: hidden;";
        outputEl.appendChild(host);

        let svg = "";
        try {
          const res = await NoteFormatter.withDocumentGlobals(doc, () =>
            m.render(renderId, codeToRender, host),
          );
          svg = typeof res === "string" ? res : res?.svg || "";
        } catch (firstErr: any) {
          // If first attempt failed, retry with alternative (fallback between original and normalized)
          const fallbackCode =
            codeToRender === code
              ? NoteFormatter.normalizeMermaidCode(code)
              : code;
          if (fallbackCode !== codeToRender) {
            const fallbackId = `agy_mm_retry_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
            const res = await NoteFormatter.withDocumentGlobals(doc, () =>
              m.render(fallbackId, fallbackCode, host),
            );
            svg = typeof res === "string" ? res : res?.svg || "";
          } else {
            throw firstErr;
          }
        } finally {
          host.remove();
        }

        if (svg) {
          try {
            const parser = new DOMParser();
            const parsedDoc = parser.parseFromString(svg, "text/html");
            const svgEl = parsedDoc.querySelector("svg");
            if (svgEl) {
              outputEl.textContent = "";
              outputEl.appendChild(doc.importNode(svgEl, true));
            } else {
              outputEl.innerHTML = svg;
            }
          } catch (_) {
            outputEl.innerHTML = svg;
          }
        } else {
          throw new Error("未生成 SVG 内容");
        }
      } catch (err: any) {
        debugLog(`Mermaid render error: ${err?.stack || err?.message || err}`);
        outputEl.innerHTML = `<div class="agy-mermaid-error">⚠️ 流程图语法解析失败: ${err?.message || err}</div>`;
        if (codeView) codeView.style.display = "block";
      }
    });
  }

  /** Ensure mermaid library is loaded into the target document's window */
  static async ensureMermaid(doc: Document): Promise<any> {
    const win =
      doc.defaultView ||
      (typeof globalThis !== "undefined" ? (globalThis as any).window : null);
    let m =
      win && (win as any).mermaid
        ? (win as any).mermaid
        : (globalThis as any).mermaid;

    const url =
      typeof rootURI !== "undefined"
        ? rootURI + "content/mermaid.min.js"
        : `chrome://${addon.data.config.addonRef}/content/mermaid.min.js`;

    if (!m && win) {
      try {
        // @ts-ignore
        (globalThis.Services || Services).scriptloader.loadSubScript(url, win);
        m = (win as any).mermaid || (globalThis as any).mermaid;
      } catch (e: any) {
        debugLog("ensureMermaid loadSubScript win error: " + (e?.message || e));
      }
    }

    if (!m) {
      try {
        // @ts-ignore
        (globalThis.Services || Services).scriptloader.loadSubScript(
          url,
          globalThis,
        );
        m = (globalThis as any).mermaid;
      } catch (e: any) {
        debugLog(
          "ensureMermaid loadSubScript global error: " + (e?.message || e),
        );
      }
    }

    if (m && !m.__agyInitialized) {
      try {
        await NoteFormatter.withDocumentGlobals(doc, () => {
          m.initialize({
            startOnLoad: false,
            securityLevel: "loose",
            suppressErrorRendering: true,
            theme: "default",
            fontFamily:
              '"Anthropic Serif", "Copernicus", "华文中宋", "STZhongsong", serif',
            flowchart: {
              htmlLabels: false,
              curve: "basis",
            },
          });
          m.__agyInitialized = true;
        });
      } catch (e: any) {
        debugLog("ensureMermaid initialize error: " + (e?.message || e));
      }
    }

    return m;
  }

  /** Format timestamp */
  static formatTimestamp(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  /** Create note HTML from Q&A */
  static createNoteHTML(
    question: string,
    answer: string,
    contexts?: ContextItem[],
    timestamp?: number,
  ): string {
    const ts = NoteFormatter.formatTimestamp(timestamp || Date.now());
    let html = `<div class="agy-note"><h2>AGY AI 笔记 — ${ts}</h2>`;
    if (contexts && contexts.length > 0) {
      for (const ctx of contexts) {
        const src = ctx.page ? `来自第 ${ctx.page} 页` : ctx.source || "";
        html += `<blockquote><p><strong>上下文:</strong> "${ctx.text.slice(0, 300)}"</p>`;
        if (src) html += `<p><em>— ${src}</em></p>`;
        html += "</blockquote>";
      }
    }
    html += `<p><strong>问题:</strong> ${question}</p><hr/>`;
    html += `<div><strong>AI 回答:</strong></div>${NoteFormatter.markdownToHTML(answer)}`;
    html += "</div>";
    return html;
  }

  /** Create conversation HTML */
  static createConversationHTML(
    messages: Array<{ role: string; content: string; timestamp: number }>,
  ): string {
    const ts = NoteFormatter.formatTimestamp(Date.now());
    let html = `<div class="agy-conversation"><h2>AGY 对话记录 — ${ts}</h2>`;
    for (const msg of messages) {
      const msgTs = NoteFormatter.formatTimestamp(msg.timestamp);
      const label =
        msg.role === "user"
          ? "👤 用户"
          : msg.role === "assistant"
            ? "🤖 AI"
            : "📌 系统";
      html += `<div class="agy-msg"><p><strong>${label}</strong> <small>${msgTs}</small></p>`;
      html +=
        msg.role === "assistant"
          ? NoteFormatter.markdownToHTML(msg.content)
          : `<p>${msg.content}</p>`;
      html += "</div><hr/>";
    }
    html += "</div>";
    return html;
  }
}
