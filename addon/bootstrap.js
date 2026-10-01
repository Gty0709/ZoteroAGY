/**
 * Most of this code is from Zotero team's official Make It Red example[1]
 * or the Zotero 7 documentation[2].
 * [1] https://github.com/zotero/make-it-red
 * [2] https://www.zotero.org/support/dev/zotero_7_for_developers
 */

function bootLog(msg) {
  try {
    try {
      if (typeof Zotero !== "undefined" && Zotero.debug)
        Zotero.debug("[AGY-BOOT] " + msg);
    } catch (_) {}
    try {
      const file = Components.classes[
        "@mozilla.org/file/local;1"
      ].createInstance(Components.interfaces.nsIFile);
      file.initWithPath("C:\\Users\\Administrator\\agy_debug.log");
      const foStream = Components.classes[
        "@mozilla.org/network/file-output-stream;1"
      ].createInstance(Components.interfaces.nsIFileOutputStream);
      foStream.init(file, 0x02 | 0x08 | 0x10, 0o666, 0);
      const converter = Components.classes[
        "@mozilla.org/intl/converter-output-stream;1"
      ].createInstance(Components.interfaces.nsIConverterOutputStream);
      converter.init(foStream, "UTF-8", 0, 0);
      converter.writeString(
        "[BOOT " + new Date().toISOString() + "] " + msg + "\r\n",
      );
      converter.close();
    } catch (e) {}
  } catch (e) {}
}

var chromeHandle;

function install(data, reason) {
  bootLog("install called");
}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  bootLog(
    "startup called! id=" + id + ", rootURI=" + rootURI + ", reason=" + reason,
  );
  try {
    var aomStartup = Components.classes[
      "@mozilla.org/addons/addon-manager-startup;1"
    ].getService(Components.interfaces.amIAddonManagerStartup);
    var manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", "__addonRef__", rootURI + "content/"],
    ]);

    const ctx = { rootURI };
    ctx._globalThis = ctx;

    bootLog("Loading script: " + `${rootURI}/content/scripts/__addonRef__.js`);
    Services.scriptloader.loadSubScript(
      `${rootURI}/content/scripts/__addonRef__.js`,
      ctx,
    );
    bootLog(
      "Subscript loaded! Zotero.__addonInstance__ = " +
        (typeof Zotero !== "undefined"
          ? typeof Zotero.__addonInstance__
          : "undefined"),
    );
    await Zotero.__addonInstance__.hooks.onStartup();
    bootLog("hooks.onStartup finished!");
  } catch (err) {
    bootLog("STARTUP ERROR: " + (err?.stack || err?.message || err));
  }
}

async function onMainWindowLoad({ window }, reason) {
  bootLog(
    "onMainWindowLoad called! window=" +
      (window ? window.document?.title : "null"),
  );
  try {
    await Zotero.__addonInstance__?.hooks.onMainWindowLoad(window);
    bootLog("hooks.onMainWindowLoad finished!");
  } catch (err) {
    bootLog("ONMAINWINDOWLOAD ERROR: " + (err?.stack || err?.message || err));
  }
}

async function onMainWindowUnload({ window }, reason) {
  await Zotero.__addonInstance__?.hooks.onMainWindowUnload(window);
}

async function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }

  await Zotero.__addonInstance__?.hooks.onShutdown();

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

async function uninstall(data, reason) {}
