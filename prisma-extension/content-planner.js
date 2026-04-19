// content-planner.js — runs on mreero.github.io/meal-planner/*
//
// Bridges window.postMessage (used by the page) with chrome.runtime (used by
// the extension's service worker). The page never sees chrome.* APIs.

(function () {
  if (window.__ppExtBridgeInstalled) return;
  window.__ppExtBridgeInstalled = true;

  // Tell the page the extension is alive. The page listens for this to
  // decide whether to show the "extension installed" UI.
  const announce = () => {
    try {
      window.postMessage({ source: "pp-ext", type: "READY",
        version: chrome.runtime.getManifest().version }, "*");
    } catch {}
  };
  announce();
  // Also announce on any later page navigation within the SPA.
  document.addEventListener("visibilitychange", announce);
  window.addEventListener("focus", announce);

  // Page → background
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.source !== "pp-planner") return;
    try {
      chrome.runtime.sendMessage(d, (resp) => {
        // Swallow errors silently; page already knows to fall back if silent.
        const err = chrome.runtime.lastError;
        if (err || !resp) return;
        window.postMessage(resp, "*");
      });
    } catch (e) {
      // Extension was reloaded/removed — tell page.
      window.postMessage({ source: "pp-ext", type: "GONE" }, "*");
    }
  });

  // Background → page (STATUS updates, ITEM_DONE, etc.)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.source === "pp-ext") {
      window.postMessage(msg, "*");
    }
  });
})();
