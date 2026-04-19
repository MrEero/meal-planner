// Perekonna Ostuabi — background service worker
//
// Receives shopping items from the meal planner page (via content-planner.js),
// opens Prisma Market search tabs one at a time, asks content-prisma.js to add
// the top result to the cart, closes the tab, and moves on.
//
// State is kept in chrome.storage.session so the popup can show progress.

const PRISMA_SEARCH = "https://www.prismamarket.ee/search?q=";
const ITEM_TIMEOUT_MS = 20000;   // how long we wait for a single add-to-cart
const BETWEEN_MS_MIN = 600;      // small pause between items so we look human
const BETWEEN_MS_MAX = 1200;

let queue = [];
let running = false;
let stats = { total: 0, done: 0, failed: 0, lastMessage: "" };
let lastClient = null; // { tabId, frameId } of the planner tab so we can reply

async function saveStats() {
  try { await chrome.storage.session.set({ stats, queueLength: queue.length, running }); }
  catch (e) { /* ignore */ }
}

function rand(min, max) { return min + Math.floor(Math.random() * (max - min)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildUrl(item) {
  const q = (item.organic ? item.name + " mahe" : item.name);
  return PRISMA_SEARCH + encodeURIComponent(q);
}

function notifyPlanner(payload) {
  if (!lastClient) return;
  const msg = { source: "pp-ext", ...payload };
  chrome.tabs.sendMessage(lastClient.tabId, msg).catch(() => {});
}

async function processOne(item) {
  const url = buildUrl(item);
  let tab;
  try {
    tab = await chrome.tabs.create({ url, active: false });
  } catch (e) {
    return { ok: false, reason: "tab_create_failed: " + e.message };
  }

  // Wait until the tab finishes loading.
  const loaded = await new Promise(resolve => {
    let done = false;
    const listener = (tabId, info) => {
      if (tabId === tab.id && info.status === "complete") {
        if (done) return;
        done = true;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(true);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false);
    }, ITEM_TIMEOUT_MS);
  });

  if (!loaded) {
    try { await chrome.tabs.remove(tab.id); } catch {}
    return { ok: false, reason: "tab_load_timeout" };
  }

  // Ask the Prisma content script to add the top result.
  const result = await new Promise(resolve => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, reason: "content_script_timeout" });
    }, ITEM_TIMEOUT_MS);

    chrome.tabs.sendMessage(
      tab.id,
      { type: "ADD_TOP_RESULT", query: item.name, organic: !!item.organic },
      (resp) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          resolve({ ok: false, reason: "sendMessage: " + chrome.runtime.lastError.message });
        } else if (!resp) {
          resolve({ ok: false, reason: "no_response" });
        } else {
          resolve(resp);
        }
      }
    );
  });

  try { await chrome.tabs.remove(tab.id); } catch {}
  return result;
}

async function runQueue() {
  if (running) return;
  running = true;
  await saveStats();
  notifyPlanner({ type: "STATUS", stats, running, queued: queue.length });

  while (queue.length) {
    const item = queue.shift();
    stats.lastMessage = "Lisan: " + item.name;
    await saveStats();
    notifyPlanner({ type: "STATUS", stats, running, queued: queue.length });

    const res = await processOne(item);
    if (res.ok) {
      stats.done++;
      notifyPlanner({ type: "ITEM_DONE", item, ok: true });
    } else {
      stats.failed++;
      stats.lastMessage = "Ei õnnestunud: " + item.name + " (" + res.reason + ")";
      notifyPlanner({ type: "ITEM_DONE", item, ok: false, reason: res.reason });
    }
    await saveStats();

    if (queue.length) await sleep(rand(BETWEEN_MS_MIN, BETWEEN_MS_MAX));
  }

  running = false;
  stats.lastMessage = "Valmis. " + stats.done + " lisatud, " + stats.failed + " vahele jäänud.";
  await saveStats();
  notifyPlanner({ type: "DONE", stats });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.source === "pp-planner") {
    if (sender.tab) lastClient = { tabId: sender.tab.id };

    if (msg.type === "PING") {
      sendResponse({ source: "pp-ext", type: "PONG", version: chrome.runtime.getManifest().version });
      return true;
    }

    if (msg.type === "ADD_ITEMS") {
      const items = Array.isArray(msg.items) ? msg.items : [];
      const clean = items
        .filter(i => i && typeof i.name === "string" && i.name.trim())
        .map(i => ({ name: i.name.trim(), organic: !!i.organic }));
      stats.total += clean.length;
      queue.push(...clean);
      saveStats();
      sendResponse({ source: "pp-ext", type: "QUEUED", count: clean.length, queued: queue.length });
      runQueue();
      return true;
    }

    if (msg.type === "STATUS_REQUEST") {
      sendResponse({ source: "pp-ext", type: "STATUS", stats, running, queued: queue.length });
      return true;
    }

    if (msg.type === "CLEAR") {
      queue = [];
      stats = { total: 0, done: 0, failed: 0, lastMessage: "Tühjendatud." };
      saveStats();
      sendResponse({ source: "pp-ext", type: "CLEARED" });
      return true;
    }
  }
});

// Popup can also ask for status.
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== "popup") return;
  const send = () => port.postMessage({ stats, running, queued: queue.length });
  send();
  const id = setInterval(send, 500);
  port.onDisconnect.addListener(() => clearInterval(id));
  port.onMessage.addListener(msg => {
    if (msg?.type === "CLEAR") {
      queue = [];
      stats = { total: 0, done: 0, failed: 0, lastMessage: "Tühjendatud." };
      saveStats();
      send();
    }
  });
});
