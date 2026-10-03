import { AGYClient } from "./api/AGYClient";

export async function registerPrefsScripts(window: Window) {
  if (!window || !window.document) return;

  const doc = window.document;
  const prefix = addon.data.config.addonRef;

  const getEl = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
    doc.getElementById(`zotero-prefpane-${prefix}-${id}`) as T | null;

  const cliInput = getEl<HTMLInputElement>("cliPath");
  const cliLabel = getEl("cliPath-label");
  const autoDetectBtn = getEl<HTMLButtonElement>("autoDetectBtn");
  const browseBtn = getEl<HTMLButtonElement>("browseBtn");
  const testBtn = getEl<HTMLButtonElement>("testBtn");
  const statusBox = getEl<HTMLDivElement>("statusBox");
  const modelSelect = getEl<HTMLSelectElement>("model");
  const effortSelect = getEl<HTMLSelectElement>("effort");
  const effortHint = getEl<HTMLElement>("effortHint");

  if (
    !cliInput ||
    !autoDetectBtn ||
    !browseBtn ||
    !testBtn ||
    !statusBox ||
    !modelSelect ||
    !effortSelect
  ) {
    // Elements might still be loading in the tab frame; retry briefly
    window.setTimeout(() => registerPrefsScripts(window), 80);
    return;
  }

  // Prevent multiple bindings on the same window
  if ((window as any).__zoteroagyPrefsBound) return;
  (window as any).__zoteroagyPrefsBound = true;

  const binName = AGYClient.getBinName();

  // Dynamic label & placeholder according to OS
  if (cliLabel) {
    cliLabel.textContent = `Antigravity CLI (${binName}) 路径:`;
  }
  if (cliInput) {
    if (Zotero.isWin) {
      cliInput.placeholder =
        "留空自动检测 (例如: AppData\\Local\\agy\\bin\\agy.exe)";
    } else if (Zotero.isMac) {
      cliInput.placeholder =
        "留空自动检测 (例如: /usr/local/bin/agy 或 ~/.local/bin/agy)";
    } else {
      cliInput.placeholder =
        "留空自动检测 (例如: ~/.local/bin/agy 或 /usr/local/bin/agy)";
    }
  }

  function showStatus(
    type: "success" | "error" | "info" | "warning",
    text: string,
  ) {
    if (!statusBox) return;
    statusBox.style.display = "block";
    if (type === "success") {
      statusBox.style.background = "#e6f4ea";
      statusBox.style.color = "#137333";
      statusBox.style.border = "1px solid #ceead6";
    } else if (type === "error") {
      statusBox.style.background = "#fce8e6";
      statusBox.style.color = "#c5221f";
      statusBox.style.border = "1px solid #fad2cf";
    } else if (type === "warning") {
      statusBox.style.background = "#fef7e0";
      statusBox.style.color = "#b06000";
      statusBox.style.border = "1px solid #feefc3";
    } else {
      statusBox.style.background = "#e8f0fe";
      statusBox.style.color = "#1a73e8";
      statusBox.style.border = "1px solid #d2e3fc";
    }
    statusBox.textContent = text;
  }

  // 1. Auto-detect CLI button
  autoDetectBtn.addEventListener("click", async () => {
    autoDetectBtn.disabled = true;
    showStatus("info", `🔍 正在自动寻找 Antigravity CLI (${binName})...`);
    try {
      const detected = await AGYClient.detectSystemAgyPath();
      if (detected) {
        cliInput.value = detected;
        Zotero.Prefs.set(
          `${addon.data.config.prefsPrefix}.cliPath`,
          detected,
          true,
        );
        cliInput.dispatchEvent(new window.Event("change", { bubbles: true }));
        cliInput.dispatchEvent(new window.Event("input", { bubbles: true }));

        const status = await AGYClient.checkCLIStatus(detected);
        if (status.available) {
          showStatus(
            "success",
            `✅ 成功找到 CLI: ${detected}${status.version ? ` (版本: ${status.version})` : ""}`,
          );
        } else {
          showStatus(
            "warning",
            `⚠️ 找到路径 ${detected}，但运行检查异常: ${status.error || "未知错误"}`,
          );
        }
      } else {
        showStatus(
          "error",
          `❌ 未在系统常见路径中检测到 ${binName}。请点击“手动选择”指定文件，或确认已全局安装 Antigravity CLI。`,
        );
      }
    } catch (err: any) {
      showStatus("error", `❌ 自动寻找失败: ${err?.message || String(err)}`);
    } finally {
      autoDetectBtn.disabled = false;
    }
  });

  // 2. Manual browse file picker button
  browseBtn.addEventListener("click", async () => {
    try {
      // @ts-ignore
      const fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(
        Components.interfaces.nsIFilePicker,
      );
      fp.init(
        window,
        `选择 Antigravity CLI (${binName})`,
        Components.interfaces.nsIFilePicker.modeOpen,
      );

      if (Zotero.isWin) {
        fp.appendFilter("可执行文件 (*.exe)", "*.exe");
        fp.appendFilters(Components.interfaces.nsIFilePicker.filterAll);
      } else {
        fp.appendFilters(Components.interfaces.nsIFilePicker.filterAll);
      }

      const res = await new Promise<number>((resolve) => {
        try {
          const ret = fp.open((result: number) => resolve(result));
          if (ret && typeof ret.then === "function") {
            ret.then(resolve);
          }
        } catch (_) {
          resolve(-1);
        }
      });

      if (
        res === Components.interfaces.nsIFilePicker.returnOK ||
        res === Components.interfaces.nsIFilePicker.returnReplace
      ) {
        const selectedPath = fp.file?.path;
        if (selectedPath) {
          cliInput.value = selectedPath;
          Zotero.Prefs.set(
            `${addon.data.config.prefsPrefix}.cliPath`,
            selectedPath,
            true,
          );
          cliInput.dispatchEvent(new window.Event("change", { bubbles: true }));
          cliInput.dispatchEvent(new window.Event("input", { bubbles: true }));

          const status = await AGYClient.checkCLIStatus(selectedPath);
          if (status.available) {
            showStatus(
              "success",
              `✅ 已设置 CLI 路径: ${selectedPath}${status.version ? ` (版本: ${status.version})` : ""}`,
            );
          } else {
            showStatus(
              "warning",
              `⚠️ 已选择文件 ${selectedPath}，但运行检查异常: ${status.error || "无法执行"}`,
            );
          }
        }
      }
    } catch (err: any) {
      showStatus("error", `❌ 选择文件失败: ${err?.message || String(err)}`);
    }
  });

  // 3. Test connection button
  testBtn.addEventListener("click", async () => {
    testBtn.disabled = true;
    showStatus("info", "⚡ 正在测试 CLI 执行与连接状态...");
    try {
      const currentVal = cliInput.value?.trim();
      const status = await AGYClient.checkCLIStatus(currentVal || undefined);
      if (status.available) {
        showStatus(
          "success",
          `✅ 连接正常！CLI 可用: ${status.path}${status.version ? ` (版本: ${status.version})` : ""}`,
        );
      } else {
        showStatus("error", `❌ CLI 不可用: ${status.error || "未能成功运行"}`);
      }
    } catch (err: any) {
      showStatus("error", `❌ 测试失败: ${err?.message || String(err)}`);
    } finally {
      testBtn.disabled = false;
    }
  });

  // 4. Model and Effort selector synchronization
  function syncEffortWithModel() {
    if (!modelSelect || !effortSelect) return;
    const currentModelId = modelSelect.value || AGYClient.getModel();
    const modelDef = AGYClient.AVAILABLE_MODELS.find(
      (m) => m.id === currentModelId,
    );
    if (!modelDef || modelDef.efforts.length === 0) {
      effortSelect.disabled = true;
      if (effortHint) {
        effortHint.textContent = `当前模型 (${modelDef?.name || currentModelId}) 不支持自定义思考强度（使用内置策略）。`;
      }
    } else {
      effortSelect.disabled = false;
      const supportedNames = modelDef.efforts
        .map((e) => (e === "high" ? "High" : e === "medium" ? "Medium" : "Low"))
        .join(", ");
      if (effortHint) {
        effortHint.textContent = `设置 ${modelDef.name} 的思考推导深度。当前模型支持: ${supportedNames}。`;
      }
      if (!modelDef.efforts.includes(effortSelect.value)) {
        effortSelect.value = modelDef.defaultEffort;
        effortSelect.dispatchEvent(
          new window.Event("change", { bubbles: true }),
        );
      }
    }
  }

  modelSelect.addEventListener("change", syncEffortWithModel);
  syncEffortWithModel();

  // 5. Initial status check on preference panel load
  try {
    const status = await AGYClient.checkCLIStatus();
    if (status.available) {
      showStatus(
        "success",
        `✅ 当前 CLI 已就绪: ${status.path}${status.version ? ` (版本: ${status.version})` : ""}`,
      );
    } else {
      showStatus(
        "warning",
        `⚠️ 当前未就绪: ${status.error || "请配置或自动检测 CLI 路径"}`,
      );
    }
  } catch (_) {}
}
